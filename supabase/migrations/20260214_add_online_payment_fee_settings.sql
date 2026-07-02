BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_payment_fee_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  online_payment_fee_enabled BOOLEAN NOT NULL DEFAULT false,
  online_payment_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_payment_fee_settings_percent_range
    CHECK (online_payment_fee_percent >= 0 AND online_payment_fee_percent <= 100)
);

ALTER TABLE public.tenant_payment_fee_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant payment fee settings" ON public.tenant_payment_fee_settings;
CREATE POLICY "Users can view their tenant payment fee settings"
  ON public.tenant_payment_fee_settings
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert tenant payment fee settings" ON public.tenant_payment_fee_settings;
CREATE POLICY "Users can insert tenant payment fee settings"
  ON public.tenant_payment_fee_settings
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can update their tenant payment fee settings" ON public.tenant_payment_fee_settings;
CREATE POLICY "Users can update their tenant payment fee settings"
  ON public.tenant_payment_fee_settings
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can delete their tenant payment fee settings" ON public.tenant_payment_fee_settings;
CREATE POLICY "Users can delete their tenant payment fee settings"
  ON public.tenant_payment_fee_settings
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS online_payment_fee_cents INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_storefront_online_payment_fee_settings(
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings RECORD;
BEGIN
  SELECT
    online_payment_fee_enabled,
    online_payment_fee_percent
  INTO v_settings
  FROM public.tenant_payment_fee_settings
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'enabled', COALESCE(v_settings.online_payment_fee_enabled, false),
    'fee_percent', LEAST(GREATEST(COALESCE(v_settings.online_payment_fee_percent, 3), 0), 100)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_online_payment_fee_settings(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_storefront_online_payment_fee_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_online_payment_fee_settings(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_storefront_order_capture(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_line RECORD;
  v_line_total_cents INTEGER := 0;
  v_final_total_cents INTEGER := 0;
  v_needs_approval BOOLEAN := FALSE;
  v_difference_cents INTEGER := 0;
  v_pack_for_you_count INTEGER := 0;
  v_unpacked_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Order already completed',
      'idempotent', true
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE line_type = 'pack_for_you'),
    COUNT(*) FILTER (WHERE line_type = 'pack_for_you' AND (final_weight_lbs IS NULL OR final_line_total_cents IS NULL))
  INTO v_pack_for_you_count, v_unpacked_count
  FROM public.order_lines
  WHERE order_id = p_order_id;

  IF v_unpacked_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order not ready for completion',
      'message', format('%s pack-for-you lines still need packing', v_unpacked_count),
      'unpacked_count', v_unpacked_count
    );
  END IF;

  FOR v_line IN
    SELECT line_type, final_line_total_cents, line_total_cents
    FROM public.order_lines
    WHERE order_id = p_order_id
  LOOP
    IF v_line.line_type = 'pack_for_you' THEN
      v_line_total_cents := v_line_total_cents + COALESCE(v_line.final_line_total_cents, 0);
    ELSE
      v_line_total_cents := v_line_total_cents + COALESCE(v_line.line_total_cents, 0);
    END IF;
  END LOOP;

  v_final_total_cents := GREATEST(
    0,
    v_line_total_cents
      - GREATEST(COALESCE(v_order.discount_cents, 0), 0)
      + GREATEST(COALESCE(v_order.tax_cents, 0), 0)
      + GREATEST(COALESCE(v_order.shipping_cents, 0), 0)
      + GREATEST(COALESCE(v_order.delivery_cents, 0), 0)
      + GREATEST(COALESCE(v_order.online_payment_fee_cents, 0), 0)
  );

  IF v_order.payment_policy = 'pay_now' AND v_order.auth_amount_cents IS NOT NULL THEN
    IF v_final_total_cents > v_order.auth_amount_cents THEN
      v_needs_approval := TRUE;
      v_difference_cents := v_final_total_cents - v_order.auth_amount_cents;

      UPDATE public.orders
      SET
        needs_customer_approval = TRUE,
        approval_difference_cents = v_difference_cents,
        updated_at = now()
      WHERE id = p_order_id;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'needs_approval',
        'needs_approval', true,
        'final_total_cents', v_final_total_cents,
        'auth_amount_cents', v_order.auth_amount_cents,
        'difference_cents', v_difference_cents,
        'online_payment_fee_cents', GREATEST(COALESCE(v_order.online_payment_fee_cents, 0), 0),
        'message', format('Final total $%.2f exceeds authorized $%.2f by $%.2f - customer approval required',
                         v_final_total_cents::NUMERIC / 100,
                         v_order.auth_amount_cents::NUMERIC / 100,
                         v_difference_cents::NUMERIC / 100)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'ready_to_capture',
    'final_total_cents', v_final_total_cents,
    'auth_amount_cents', v_order.auth_amount_cents,
    'payment_policy', v_order.payment_policy,
    'stripe_payment_intent_id', v_order.stripe_payment_intent_id,
    'online_payment_fee_cents', GREATEST(COALESCE(v_order.online_payment_fee_cents, 0), 0),
    'message', 'Order validated and ready for payment capture'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_storefront_order_after_payment(
  p_order_id UUID,
  p_payment_intent_id TEXT,
  p_paid_total_cents INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_line RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Order already finalized',
      'idempotent', true
    );
  END IF;

  IF v_order.inventory_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Inventory already decremented',
      'idempotent', true
    );
  END IF;

  FOR v_line IN
    SELECT id, line_type, product_id, selected_bin_ids, final_weight_lbs, requested_weight_lbs, quantity
    FROM public.order_lines
    WHERE order_id = p_order_id
  LOOP
    IF v_line.line_type = 'exact_package' AND v_line.selected_bin_ids IS NOT NULL THEN
      UPDATE public.package_bins
      SET
        status = 'sold',
        updated_at = now()
      WHERE id = ANY(v_line.selected_bin_ids::UUID[])
        AND tenant_id = v_order.tenant_id;

    ELSIF v_line.line_type = 'pack_for_you' THEN
      IF v_line.selected_bin_ids IS NOT NULL THEN
        UPDATE public.package_bins
        SET
          status = 'sold',
          updated_at = now()
        WHERE id = ANY(v_line.selected_bin_ids::UUID[])
          AND tenant_id = v_order.tenant_id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.product_reservations
  SET
    status = 'released',
    updated_at = now()
  WHERE order_id = p_order_id
    AND status = 'active';

  UPDATE public.orders
  SET
    total_cents = p_paid_total_cents,
    total = (p_paid_total_cents::NUMERIC / 100),
    stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
    capture_status = CASE
      WHEN payment_policy = 'pay_now' THEN 'captured'
      ELSE 'n/a'
    END,
    payment_status = 'paid',
    payment_captured_at = CASE
      WHEN payment_policy = 'pay_now' THEN now()
      ELSE NULL
    END,
    inventory_applied_at = now(),
    completed_at = now(),
    status = 'completed',
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'final_total_cents', p_paid_total_cents,
    'online_payment_fee_cents', GREATEST(COALESCE(v_order.online_payment_fee_cents, 0), 0),
    'message', 'Order finalized successfully'
  );
END;
$$;

COMMIT;