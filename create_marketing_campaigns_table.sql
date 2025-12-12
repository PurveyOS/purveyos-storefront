-- Create marketing_campaigns table to track email campaigns
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_id ON public.marketing_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_campaign_id ON public.marketing_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_sent_at ON public.marketing_campaigns(sent_at DESC);

-- Enable RLS
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can only see campaigns for their tenant
CREATE POLICY "Allow authenticated users to read marketing campaigns"
ON public.marketing_campaigns
FOR SELECT
TO authenticated
USING (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- RLS Policy: Authenticated users can insert campaigns for their tenant
CREATE POLICY "Allow authenticated users to insert marketing campaigns"
ON public.marketing_campaigns
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- RLS Policy: Authenticated users can update campaigns for their tenant
CREATE POLICY "Allow authenticated users to update marketing campaigns"
ON public.marketing_campaigns
FOR UPDATE
TO authenticated
USING (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
)
WITH CHECK (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'marketing_campaigns' AND schemaname = 'public';
