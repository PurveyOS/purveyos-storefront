# Cloudflare Automation for PurveyOS Storefronts

## Overview

When customers sign up for webhosting, their storefront subdomain needs to be automatically configured in Cloudflare. This document outlines the implementation approach.

## Cloudflare API Integration

### Environment Variables Needed

Add to your PurveyOS backend environment:

```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ZONE_ID=your_purveyos_store_zone_id
STOREFRONT_TARGET_IP=your_storefront_server_ip
# OR
STOREFRONT_TARGET_DOMAIN=your-storefront-app.vercel.app
```

### API Token Setup

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create a custom token with these permissions:
   - **Zone:DNS:Edit** for the `purveyos.store` zone
   - **Zone:Zone Settings:Read** for the `purveyos.store` zone

### Supabase Edge Function for DNS Management

Create `supabase/functions/manage-dns/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN')!
const CLOUDFLARE_ZONE_ID = Deno.env.get('CLOUDFLARE_ZONE_ID')!
const STOREFRONT_TARGET = Deno.env.get('STOREFRONT_TARGET_IP') || Deno.env.get('STOREFRONT_TARGET_DOMAIN')!

interface DNSRecord {
  type: 'A' | 'CNAME'
  name: string
  content: string
  proxied: boolean
}

async function createDNSRecord(subdomain: string): Promise<boolean> {
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(STOREFRONT_TARGET)
  
  const record: DNSRecord = {
    type: isIP ? 'A' : 'CNAME',
    name: subdomain,
    content: STOREFRONT_TARGET,
    proxied: true
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record)
    }
  )

  const result = await response.json()
  return result.success
}

async function deleteDNSRecord(subdomain: string): Promise<boolean> {
  // First, find the record ID
  const listResponse = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${subdomain}.purveyos.store`,
    {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      }
    }
  )

  const listResult = await listResponse.json()
  if (!listResult.success || listResult.result.length === 0) {
    return false
  }

  const recordId = listResult.result[0].id

  // Delete the record
  const deleteResponse = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      }
    }
  )

  const deleteResult = await deleteResponse.json()
  return deleteResult.success
}

serve(async (req) => {
  try {
    const { action, subdomain } = await req.json()

    if (!subdomain) {
      return new Response(
        JSON.stringify({ error: 'Subdomain is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let success = false

    switch (action) {
      case 'create':
        success = await createDNSRecord(subdomain)
        break
      case 'delete':
        success = await deleteDNSRecord(subdomain)
        break
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use "create" or "delete"' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify({ success }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('DNS management error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

## Integration with Storefront Settings

### Update StorefrontSettingsScreen.tsx

Add DNS management to the storefront enable/disable functionality:

```typescript
const enableStorefront = async () => {
  try {
    setLoading(true)
    
    // Create DNS record first
    const dnsResult = await supabase.functions.invoke('manage-dns', {
      body: {
        action: 'create',
        subdomain: domainSlug
      }
    })

    if (!dnsResult.data?.success) {
      throw new Error('Failed to configure DNS')
    }

    // Then update database
    await updateStorefrontSettings({
      ...settings,
      enabled: true
    })

    setIsEnabled(true)
  } catch (error) {
    console.error('Error enabling storefront:', error)
    alert('Failed to enable storefront. Please try again.')
  } finally {
    setLoading(false)
  }
}

const disableStorefront = async () => {
  try {
    setLoading(true)
    
    // Update database first
    await updateStorefrontSettings({
      ...settings,
      enabled: false
    })

    // Then remove DNS record
    await supabase.functions.invoke('manage-dns', {
      body: {
        action: 'delete', 
        subdomain: domainSlug
      }
    })

    setIsEnabled(false)
  } catch (error) {
    console.error('Error disabling storefront:', error)
    // Still mark as disabled even if DNS removal fails
    setIsEnabled(false)
  } finally {
    setLoading(false)
  }
}
```

## Subscription Webhook Integration

### Stripe Webhook Handler

When a customer subscribes to webhosting, automatically enable DNS:

```typescript
// In your Stripe webhook handler
case 'customer.subscription.created':
case 'customer.subscription.updated':
  const subscription = event.data.object
  
  // Check if this includes webhosting
  const hasWebhosting = subscription.items.data.some(item => 
    item.price.nickname?.includes('webhosting') || 
    item.price.metadata?.includes_webhosting === 'true'
  )

  if (hasWebhosting) {
    const customer = await stripe.customers.retrieve(subscription.customer)
    const tenantId = customer.metadata.tenant_id

    // Get storefront settings
    const { data: storefrontSettings } = await supabase
      .from('storefront_settings')
      .select('domain_slug')
      .eq('tenant_id', tenantId)
      .single()

    if (storefrontSettings?.domain_slug) {
      // Create DNS record
      await supabase.functions.invoke('manage-dns', {
        body: {
          action: 'create',
          subdomain: storefrontSettings.domain_slug
        }
      })
    }
  }
  break
```

## Manual Setup for Testing

### Immediate Solution

For testing with your "Sweet P Pastures" farm:

1. **Option A: Use Wildcard DNS (Recommended)**
   - Add wildcard record in Cloudflare: `*` → your server IP
   - All subdomains will work immediately

2. **Option B: Manual Subdomain**
   - Add specific record: `sweetppastures` → your server IP
   - Only this subdomain will work

### Local Development Workaround

For local testing, you can modify your hosts file:

**Windows**: Edit `C:\Windows\System32\drivers\etc\hosts`
```
127.0.0.1 sweetppastures.purveyos.store
```

This will make the subdomain point to localhost for testing.

## Security Considerations

1. **API Token Permissions**: Limit Cloudflare token to only DNS edit permissions
2. **Rate Limiting**: Implement rate limits for DNS operations
3. **Validation**: Validate subdomain format before creating DNS records
4. **Monitoring**: Log all DNS operations for audit purposes

## Cost Implications

- Cloudflare DNS records are free (no limit on subdomains)
- API calls are free within reasonable usage
- Universal SSL covers all subdomains at no extra cost

## Alternative Approaches

### 1. Wildcard Only (Simpler)
Just use a single wildcard DNS record and handle routing in your application. No individual DNS management needed.

### 2. Third-Party DNS Services
- Route53 (AWS)
- Google Cloud DNS
- Azure DNS

All support similar API-based subdomain management.

## Implementation Priority

1. **Immediate**: Set up wildcard DNS record for testing
2. **Phase 1**: Implement manual DNS management in StorefrontSettingsScreen
3. **Phase 2**: Automate via subscription webhooks
4. **Phase 3**: Add monitoring and error handling