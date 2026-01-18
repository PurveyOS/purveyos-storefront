-- Add Venmo/Zelle QR URL fields to storefront_settings for unified payment display
ALTER TABLE IF EXISTS public.storefront_settings
  ADD COLUMN IF NOT EXISTS venmo_qr_url TEXT,
  ADD COLUMN IF NOT EXISTS zelle_qr_url TEXT;

-- Optional: backfill from tenants if such fields exist there (placeholder; adjust if tenants has columns)
-- UPDATE public.storefront_settings ss
-- SET venmo_qr_url = t.venmo_qr_url,
--     zelle_qr_url = t.zelle_qr_url
-- FROM public.tenants t
-- WHERE ss.tenant_id = t.id
--   AND (t.venmo_qr_url IS NOT NULL OR t.zelle_qr_url IS NOT NULL);

-- Index for fast lookups by tenant
CREATE INDEX IF NOT EXISTS idx_storefront_settings_qr_tenant
  ON public.storefront_settings(tenant_id);
