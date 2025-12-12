# Email Marketing Function Setup

## Overview
This edge function sends marketing emails to subscribed customers using SendGrid. It integrates with the existing SendGrid setup and customer profiles system.

## Prerequisites
- SendGrid API key already configured in Supabase secrets (as `SENDGRID_API_KEY`)
- Customer profiles with `subscribed_to_emails` flag
- Tenants table with email and name fields

## Setup Steps

### 1. Create Marketing Campaigns Table
Run the SQL migration in Supabase:
```bash
supabase db push create_marketing_campaigns_table.sql
```

Or copy/paste the SQL from `create_marketing_campaigns_table.sql` into Supabase SQL Editor.

### 2. Deploy Edge Function
Deploy the `send-marketing-email` function to Supabase:

```bash
supabase functions deploy send-marketing-email
```

Or through Supabase dashboard:
1. Go to Edge Functions
2. Create new function
3. Copy content from `send-marketing-email.ts`
4. Deploy

### 3. Configure EmailCampaignBuilder Component
Update the EmailCampaignBuilder in huckster-ui to call the edge function:

```typescript
const sendCampaign = async () => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-marketing-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseClient.auth.session()?.access_token}`,
      },
      body: JSON.stringify({
        campaign_id: generateUUID(),
        tenant_id: storedTenantId,
        subject: campaignSubject,
        body: campaignBody,
        template: selectedTemplate,
        recipient_filter: recipientFilter,
        recipient_emails: customRecipients,
      }),
    }
  );
  
  const result = await response.json();
  if (result.success) {
    toast.success(`Campaign sent to ${result.sent_count} recipients`);
  } else {
    toast.error(result.error);
  }
};
```

## API Request Format

```json
{
  "campaign_id": "uuid-string",
  "tenant_id": "uuid-string",
  "subject": "Campaign Subject",
  "body": "<html>Email content here</html>",
  "template": "promotional|newsletter|announcement",
  "recipient_filter": "subscribed|all|custom",
  "recipient_emails": ["email@example.com"]
}
```

## Recipient Filter Options
- **subscribed**: Only send to customers with `subscribed_to_emails = true`
- **all**: Send to all customers
- **custom**: Send to specific emails in `recipient_emails` array

## Response

### Success
```json
{
  "success": true,
  "message": "Campaign sent to 150 recipients",
  "sent_count": 150,
  "campaign_id": "uuid"
}
```

### Error
```json
{
  "success": false,
  "error": "Error message"
}
```

## Features
- ✅ SendGrid integration (same as receipt emails)
- ✅ Filter by subscription status
- ✅ Custom recipient lists
- ✅ Tenant isolation (RLS)
- ✅ Campaign tracking
- ✅ Open & click tracking
- ✅ Dynamic from address (uses tenant email)

## Security
- Only authenticated users can send campaigns
- Tenant isolation via RLS policies
- Users can only send campaigns for their own tenant
- API key stored in Supabase secrets

## Testing
```bash
curl -X POST https://your-supabase-url/functions/v1/send-marketing-email \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "test-123",
    "tenant_id": "your-tenant-id",
    "subject": "Test Campaign",
    "body": "<h1>Hello</h1>",
    "recipient_filter": "subscribed"
  }'
```

## Troubleshooting

### SendGrid Key Error
- Verify `SENDGRID_API_KEY` is set in Supabase secrets
- Check key has email sending permissions

### No Recipients Found
- Check customers have emails in `customer_profiles`
- Verify `subscribed_to_emails = true` if using subscribed filter

### Tenant Not Found
- Ensure tenant_id exists in `tenants` table
- Verify user has correct tenant_id in their profile
