-- RPCs: Split-phase order completion (prepare → capture payment → finalize)
-- Date: 2026-02-03
-- Purpose: Atomic order completion with exactly-once guarantees
-- Phase 1: Validate and compute final totals (NO payment, NO inventory changes)
-- Phase 2: Capture payment via edge function orchestrator
-- Phase 3: Apply inventory decrements exactly once after payment succeeds

BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 1: Prepare order for capture (validation + final total calculation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_storefront_order_capture(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_line RECORD;
  v_final_total_cents INTEGER := 0;
  v_needs_approval BOOLEAN := FALSE;
  v_difference_cents INTEGER := 0;
  v_pack_for_you_count INTEGER := 0;
  v_unpacked_count INTEGER := 0;
BEGIN
  -- Lock order row FOR UPDATE (ensures exactly-once execution in retries)
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Idempotency guard: already completed
  IF v_order.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Order already completed',
      'idempotent', true
    );
  END IF;

  -- Count pack-for-you lines and validate they're all packed
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

  -- Compute final total from order_lines (server-side, never trust client)
  FOR v_line IN
    SELECT
      line_type,
      final_line_total_cents,
      line_total_cents,
      quantity
    FROM public.order_lines
    WHERE order_id = p_order_id
  LOOP
    IF v_line.line_type = 'pack_for_you' THEN
      -- Use final_line_total_cents for pack-for-you
      v_final_total_cents := v_final_total_cents + v_line.final_line_total_cents;
    ELSE
      -- Use original line_total_cents for exact_package
      v_final_total_cents := v_final_total_cents + v_line.line_total_cents;
    END IF;
  END LOOP;

  -- Check if final total exceeds authorized amount (for pay_now orders)
  IF v_order.payment_policy = 'pay_now' AND v_order.auth_amount_cents IS NOT NULL THEN
    IF v_final_total_cents > v_order.auth_amount_cents THEN
      v_needs_approval := TRUE;
      v_difference_cents := v_final_total_cents - v_order.auth_amount_cents;

      -- Mark order as needing approval (don't capture yet)
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
        'message', format('Final total $%.2f exceeds authorized $%.2f by $%.2f - customer approval required',
                         v_final_total_cents::NUMERIC / 100,
                         v_order.auth_amount_cents::NUMERIC / 100,
                         v_difference_cents::NUMERIC / 100)
      );
    END IF;
  END IF;

  -- Ready to capture
  RETURN jsonb_build_object(
    'success', true,
    'status', 'ready_to_capture',
    'final_total_cents', v_final_total_cents,
    'auth_amount_cents', v_order.auth_amount_cents,
    'payment_policy', v_order.payment_policy,
    'stripe_payment_intent_id', v_order.stripe_payment_intent_id,
    'message', 'Order validated and ready for payment capture'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Phase 3: Finalize order after payment succeeds (inventory + completion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_storefront_order_after_payment(
  p_order_id UUID,
  p_payment_intent_id TEXT,
  p_paid_total_cents INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_line RECORD;
  v_bin RECORD;
  v_decrement_result JSONB;
BEGIN
  -- Lock order row FOR UPDATE
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Idempotency guard: already completed
  IF v_order.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Order already finalized',
      'idempotent', true
    );
  END IF;

  -- Idempotency guard: inventory already applied
  IF v_order.inventory_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_completed',
      'message', 'Inventory already decremented',
      'idempotent', true
    );
  END IF;

  -- Apply inventory decrements (exact implementation depends on your bin system)
  -- This is a simplified version - adapt to your actual bin decrement logic
  FOR v_line IN
    SELECT
      id,
      line_type,
      product_id,
      selected_bin_ids,
      final_weight_lbs,
      requested_weight_lbs,
      quantity
    FROM public.order_lines
    WHERE order_id = p_order_id
  LOOP
    IF v_line.line_type = 'exact_package' AND v_line.selected_bin_ids IS NOT NULL THEN
      -- Decrement exact bins selected at checkout
      -- (Call your existing reserve_selected_bins or similar function)
      -- For now, simplified: mark bins as sold
      UPDATE public.package_bins
      SET
        status = 'sold',
        updated_at = now()
      WHERE id = ANY(v_line.selected_bin_ids::UUID[])
        AND tenant_id = v_order.tenant_id;

    ELSIF v_line.line_type = 'pack_for_you' THEN
      -- For pack-for-you, bins should have been selected during packing
      -- and possibly already decremented at pack time
      -- If not decremented yet, do so now
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

  -- Release reservations (change status from 'active' to 'released')
  UPDATE public.product_reservations
  SET
    status = 'released',
    updated_at = now()
  WHERE order_id = p_order_id
    AND status = 'active';

  -- Mark order as completed with all idempotency guards set
  UPDATE public.orders
  SET
    total_cents = p_paid_total_cents,
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
    'message', 'Order finalized successfully'
  );
END;
$$;

COMMIT;
