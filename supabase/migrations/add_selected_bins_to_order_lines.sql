-- Add selected_bins column to order_lines for capturing bin selections
-- This column stores the package_keys and quantities selected by the customer
-- Format: [{"package_key": "productId|weight", "qty": 1, ...}, ...]

ALTER TABLE public.order_lines
ADD COLUMN IF NOT EXISTS selected_bins jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.order_lines.selected_bins IS 'JSON array of selected bins with package_key and qty for weight-based products';
