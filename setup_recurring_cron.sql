-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to run the recurring-order-renewal function daily at 2 AM
SELECT cron.schedule(
  'recurring-order-renewal-daily',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://sliziqekqtfiqjlbdbft.supabase.co/functions/v1/recurring-order-renewal',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule (if needed):
-- SELECT cron.unschedule('recurring-order-renewal-daily');
