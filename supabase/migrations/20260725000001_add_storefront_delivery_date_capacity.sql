BEGIN;

ALTER TABLE public.storefront_settings
  ADD COLUMN IF NOT EXISTS delivery_date_scheduling_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_max_per_day integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_date_window_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS delivery_schedule_mode text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS delivery_allowed_weekdays jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_allowed_month_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_allowed_month_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_lead_time_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_method text,
  ADD COLUMN IF NOT EXISTS requested_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_slot_number integer;

DO $$
DECLARE
  v_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'fulfillment_method'
  ) THEN
    SELECT conname INTO v_name
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%fulfillment_method%';

    IF v_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', v_name);
    END IF;

    ALTER TABLE public.orders
      ADD CONSTRAINT orders_fulfillment_method_check
      CHECK (fulfillment_method IS NULL OR fulfillment_method IN ('shipping','farm_pickup','farmers_market','dropoff','other','pickup','delivery'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_storefront_delivery_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean := false;
  v_max_per_day integer := 0;
  v_window_days integer := 14;
  v_schedule_mode text := 'weekly';
  v_allowed_weekdays integer[] := ARRAY[0,1,2,3,4,5,6];
  v_allowed_month_dates text[] := ARRAY[]::text[];
  v_lead_time_days integer := 0;
  v_existing_count integer := 0;
  v_lock_key bigint;
  v_requested_dow integer;
  v_requested_mmdd text;
BEGIN
  IF NEW.fulfillment_method IS DISTINCT FROM 'delivery' OR NEW.requested_delivery_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(s.delivery_date_scheduling_enabled, false),
    greatest(coalesce(s.delivery_max_per_day, 0), 0),
    greatest(coalesce(s.delivery_date_window_days, 14), 1),
    case when coalesce(nullif(trim(s.delivery_schedule_mode), ''), 'weekly') = 'monthly' then 'monthly' else 'weekly' end,
    coalesce(
      (
        SELECT array_agg(distinct day_value ORDER BY day_value)
        FROM (
          SELECT elem::integer AS day_value
          FROM jsonb_array_elements_text(coalesce(s.delivery_allowed_weekdays, '[]'::jsonb)) elem
          WHERE elem ~ '^[0-9]+$'
            AND elem::integer BETWEEN 0 AND 6
        ) days
      ),
      ARRAY[0,1,2,3,4,5,6]
    ),
    coalesce(
      (
        SELECT array_agg(distinct month_day ORDER BY month_day)
        FROM (
          SELECT trim(elem) AS month_day
          FROM jsonb_array_elements_text(coalesce(s.delivery_allowed_month_dates, '[]'::jsonb)) elem
          WHERE trim(elem) ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        ) month_dates
      ),
      ARRAY[]::text[]
    ),
    greatest(coalesce(s.delivery_lead_time_days, 0), 0)
  INTO v_enabled, v_max_per_day, v_window_days, v_schedule_mode, v_allowed_weekdays, v_allowed_month_dates, v_lead_time_days
  FROM public.storefront_settings s
  WHERE s.tenant_id = NEW.tenant_id
  LIMIT 1;

  IF NOT coalesce(v_enabled, false) OR v_max_per_day <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.requested_delivery_date < current_date THEN
    RAISE EXCEPTION 'delivery_date_in_past';
  END IF;

  IF NEW.requested_delivery_date < (current_date + make_interval(days => v_lead_time_days))::date THEN
    RAISE EXCEPTION 'delivery_date_before_lead_time';
  END IF;

  IF NEW.requested_delivery_date > (current_date + make_interval(days => v_window_days))::date THEN
    RAISE EXCEPTION 'delivery_date_outside_window';
  END IF;

  IF v_schedule_mode = 'monthly' THEN
    v_requested_mmdd := to_char(NEW.requested_delivery_date, 'MM-DD');

    IF cardinality(v_allowed_month_dates) = 0 OR NOT (v_requested_mmdd = ANY(v_allowed_month_dates)) THEN
      RAISE EXCEPTION 'delivery_date_not_allowed';
    END IF;
  ELSE
    v_requested_dow := extract(dow from NEW.requested_delivery_date)::integer;
    IF cardinality(v_allowed_weekdays) = 0 OR NOT (v_requested_dow = ANY(v_allowed_weekdays)) THEN
      RAISE EXCEPTION 'delivery_date_not_allowed';
    END IF;
  END IF;

  v_lock_key := ('x' || substr(md5(NEW.tenant_id::text || ':' || NEW.requested_delivery_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.orders o
  WHERE o.tenant_id = NEW.tenant_id
    AND o.fulfillment_method = 'delivery'
    AND o.requested_delivery_date = NEW.requested_delivery_date
    AND o.status <> 'cancelled'
    AND (TG_OP = 'INSERT' OR o.id <> NEW.id);

  IF v_existing_count >= v_max_per_day THEN
    RAISE EXCEPTION 'delivery_date_capacity_reached';
  END IF;

  NEW.delivery_slot_number := v_existing_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_storefront_delivery_capacity ON public.orders;

CREATE TRIGGER trg_enforce_storefront_delivery_capacity
BEFORE INSERT OR UPDATE OF fulfillment_method, requested_delivery_date, status, tenant_id
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_storefront_delivery_capacity();

CREATE OR REPLACE FUNCTION public.get_storefront_delivery_date_availability(
  p_tenant_id uuid,
  p_start_date date DEFAULT current_date,
  p_days integer DEFAULT 14
)
RETURNS TABLE (
  delivery_date date,
  remaining_slots integer,
  max_deliveries integer,
  is_available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean := false;
  v_max_per_day integer := 0;
  v_window_days integer := 14;
  v_schedule_mode text := 'weekly';
  v_allowed_weekdays integer[] := ARRAY[0,1,2,3,4,5,6];
  v_allowed_month_dates text[] := ARRAY[]::text[];
  v_lead_time_days integer := 0;
  v_start date;
  v_days integer;
BEGIN
  SELECT
    coalesce(s.delivery_date_scheduling_enabled, false),
    greatest(coalesce(s.delivery_max_per_day, 0), 0),
    greatest(coalesce(s.delivery_date_window_days, 14), 1),
    case when coalesce(nullif(trim(s.delivery_schedule_mode), ''), 'weekly') = 'monthly' then 'monthly' else 'weekly' end,
    coalesce(
      (
        SELECT array_agg(distinct day_value ORDER BY day_value)
        FROM (
          SELECT elem::integer AS day_value
          FROM jsonb_array_elements_text(coalesce(s.delivery_allowed_weekdays, '[]'::jsonb)) elem
          WHERE elem ~ '^[0-9]+$'
            AND elem::integer BETWEEN 0 AND 6
        ) days
      ),
      ARRAY[0,1,2,3,4,5,6]
    ),
    coalesce(
      (
        SELECT array_agg(distinct month_day ORDER BY month_day)
        FROM (
          SELECT trim(elem) AS month_day
          FROM jsonb_array_elements_text(coalesce(s.delivery_allowed_month_dates, '[]'::jsonb)) elem
          WHERE trim(elem) ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        ) month_dates
      ),
      ARRAY[]::text[]
    ),
    greatest(coalesce(s.delivery_lead_time_days, 0), 0)
  INTO v_enabled, v_max_per_day, v_window_days, v_schedule_mode, v_allowed_weekdays, v_allowed_month_dates, v_lead_time_days
  FROM public.storefront_settings s
  WHERE s.tenant_id = p_tenant_id
  LIMIT 1;

  IF NOT coalesce(v_enabled, false) OR v_max_per_day <= 0 THEN
    RETURN;
  END IF;

  v_start := greatest(coalesce(p_start_date, current_date), (current_date + make_interval(days => v_lead_time_days))::date);
  v_days := greatest(1, least(coalesce(p_days, v_window_days), v_window_days));

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(v_start, v_start + (v_days - 1), interval '1 day')::date AS day
  ),
  schedulable_days AS (
    SELECT d.day
    FROM days d
    WHERE (
      v_schedule_mode = 'monthly'
      AND cardinality(v_allowed_month_dates) > 0
      AND to_char(d.day, 'MM-DD') = ANY(v_allowed_month_dates)
    )
    OR (
      v_schedule_mode <> 'monthly'
      AND cardinality(v_allowed_weekdays) > 0
      AND extract(dow from d.day)::integer = ANY(v_allowed_weekdays)
    )
  ),
  usage_counts AS (
    SELECT
      o.requested_delivery_date AS day,
      count(*)::integer AS used_slots
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.fulfillment_method = 'delivery'
      AND o.requested_delivery_date BETWEEN v_start AND (v_start + (v_days - 1))
      AND o.status <> 'cancelled'
    GROUP BY o.requested_delivery_date
  )
  SELECT
    d.day AS delivery_date,
    greatest(v_max_per_day - coalesce(u.used_slots, 0), 0) AS remaining_slots,
    v_max_per_day AS max_deliveries,
    (coalesce(u.used_slots, 0) < v_max_per_day) AS is_available
  FROM schedulable_days d
  LEFT JOIN usage_counts u ON u.day = d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_delivery_date_availability(uuid, date, integer)
  TO anon, authenticated, service_role;

COMMIT;
