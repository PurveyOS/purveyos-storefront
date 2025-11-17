-- Enable products for Sweet P Pastures storefront
UPDATE public.products 
SET is_online = true
WHERE tenant_id = '3b0f917d-4cd0-4381-b080-b80e8d77d154'
AND (is_online = false OR is_online IS NULL);

-- Verify products are now online
SELECT name, pricePer, unit, category, is_online 
FROM public.products 
WHERE tenant_id = '3b0f917d-4cd0-4381-b080-b80e8d77d154'
AND is_online = true
ORDER BY name;