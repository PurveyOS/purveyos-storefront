import { useState, useEffect } from 'react';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  storefront_enabled: boolean;
  subscription_tier: string;
}

export function useTenantFromDomain(): {
  tenant: TenantInfo | null;
  loading: boolean;
  error: string | null;
} {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolveTenant = async () => {
      try {
        const hostname = window.location.hostname;
        let slug: string | null = null;

        console.log('🔍 Resolving tenant for hostname:', hostname);

        // Extract subdomain
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
          // Development mode - check for ?tenant=xxx query param or use demo
          const params = new URLSearchParams(window.location.search);
          slug = params.get('tenant') || 'demo-farm';
          console.log('🏠 Development mode, using slug:', slug);
        } else if (hostname.endsWith('.purveyos.store')) {
          // Production storefront domain - extract subdomain
          // sweetppastures.purveyos.store -> "sweet-p-pastures"
          const extractedSlug = hostname.replace('.purveyos.store', '');
          console.log('🌐 Extracted slug from domain:', extractedSlug);
          
          // Convert domain format to database slug format
          // "sweetppastures" -> "sweet-p-pastures"
          if (extractedSlug === 'sweetppastures') {
            slug = 'sweet-p-pastures';
            console.log('✅ Converted to database slug:', slug);
          } else {
            slug = extractedSlug;
            console.log('📝 Using extracted slug as-is:', slug);
          }
        } else if (hostname === 'purveyos.store') {
          // Root storefront domain - redirect to marketing
          window.location.href = 'https://purveyos.com';
          return;
        } else {
          // Not a valid storefront domain
          setError('Invalid storefront domain. Expected format: yourfarm.purveyos.store');
          setLoading(false);
          return;
        }

        if (!slug) {
          setError('No tenant found in domain');
          setLoading(false);
          return;
        }

        // For development, return mock data if no Supabase connection
        // TODO: Replace with real Supabase query when properly configured
        if (slug === 'demo-farm') {
          setTenant({
            id: 'demo-tenant-id',
            slug: 'demo-farm',
            name: 'Demo Farm',
            storefront_enabled: true,
            subscription_tier: 'pro_webhosting'
          });
        } else {
          // Try real Supabase query
          console.log('🔍 Looking up tenant in database:', slug);
          try {
            const { supabase } = await import('../lib/supabaseClient');
            console.log('📊 Supabase client loaded:', !!supabase);
            
            if (supabase) {
              console.log('🔎 Querying tenants table for slug:', slug);
              const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('id, slug, name, storefront_enabled, subscription_tier')
                .eq('slug', slug)
                .eq('storefront_enabled', true)
                .single();

              console.log('📋 Query result:', { tenantData, tenantError });

              if (tenantError || !tenantData) {
                console.error('❌ Tenant not found or disabled:', tenantError);
                setError(`Storefront "${slug}" not found or disabled`);
              } else {
                console.log('✅ Tenant found:', tenantData);
                setTenant(tenantData);
              }
            } else {
              console.error('❌ Supabase client is null');
              setError(`Tenant "${slug}" - Supabase not configured, using demo mode`);
            }
          } catch (supabaseError) {
            console.error('❌ Supabase query failed:', supabaseError);
            setError(`Failed to load storefront "${slug}"`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resolve tenant');
      } finally {
        setLoading(false);
      }
    };

    resolveTenant();
  }, []);

  return { tenant, loading, error };
}