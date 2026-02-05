import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // 👈 adjust path if yours is different

// Minimal shape that matches how the rest of your app uses `tenant`
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_tier: string | null;
  storefront_enabled: boolean;
  stripe_account_id?: string | null;

  // Tax-related settings (optional so existing rows don't break)
  tax_rate?: number | null;               // e.g. 0.0825 for 8.25%
  tax_included?: boolean | null;         // true if prices already include tax
  charge_tax_on_online?: boolean | null; // allow disabling tax for online orders
}

interface UseTenantResult {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the current tenant based on the hostname.
 *
 * - In development (localhost / 127.0.0.1 / *.pages.dev) it uses a fixed dev slug.
 * - In production it uses the subdomain as the slug (e.g. sweetp.purveyos.store → "sweetp").
 * - Then it looks up the tenant row in Supabase by slug and returns the full tenant object.
 */
export function useTenantFromDomain(): UseTenantResult {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!supabase) {
      console.error('useTenantFromDomain: Supabase client not available');
      setError('Database not configured');
      setLoading(false);
      return;
    }
    
    const client = supabase;
    let cancelled = false;

    async function resolveTenant() {
      try {
        setLoading(true);
        setError(null);

        let host = "";
        if (typeof window !== "undefined") {
          host = window.location.host.toLowerCase();
          console.log("🔍 Resolving tenant for hostname:", host);
        }

        // 1) Decide which slug to use
        const devSlug =
          import.meta.env.VITE_DEV_TENANT_SLUG || "testfarmstore"; // dev fallback

        let slug: string;

        if (!host) {
          // SSR or weird environment – fall back to dev slug
          slug = devSlug;
        } else if (
          host.startsWith("localhost") ||
          host.startsWith("127.0.0.1") ||
          host.endsWith(".pages.dev")
        ) {
          // Local dev & Cloudflare preview
          console.log("🏠 Development/preview mode, using slug:", devSlug);
          slug = devSlug;
        } else {
          // Production: subdomain is the slug
          const [subdomain] = host.split(".");
          slug = subdomain;
          console.log("🌐 Production mode, subdomain slug:", slug);
        }

        if (!slug) {
          throw new Error("Could not resolve tenant slug from hostname");
        }

        // 2) Look up tenant in Supabase by slug
        console.log("🔎 Looking up tenant with slug:", slug);
        const { data, error: supaError } = await client
          .from("tenants")
          .select(
            "id, slug, name, subscription_tier, storefront_enabled, tax_rate, tax_included, charge_tax_on_online, stripe_account_id"
          )
          .eq("slug", slug)
          .single();

        if (cancelled) return;

        if (supaError) {
          console.error("❌ Supabase tenant lookup error:", supaError);
          setError("Unable to find storefront for this domain.");
          setTenant(null);
        } else if (!data) {
          console.warn("⚠ No tenant found for slug:", slug);
          setError("Storefront not configured for this domain.");
          setTenant(null);
        } else {
          console.log("✅ Resolved tenant:", data);
          
          // Store slug in localStorage for Edge Function calls
          if (typeof window !== "undefined") {
            localStorage.setItem('tenant_slug', slug);
          }
          
          setTenant(data as Tenant);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("❌ Error resolving tenant:", err);
          setError(err.message ?? "Unknown tenant error.");
          setTenant(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    resolveTenant();

    return () => {
      cancelled = true;
    };
  }, []);

  return { tenant, loading, error };
}

