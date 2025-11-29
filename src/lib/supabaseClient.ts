// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔧 Supabase Environment Check:');
console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  throw new Error('Missing Supabase environment variables');
}

console.log('✅ Supabase environment variables configured successfully');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable session persistence for customer portal
    autoRefreshToken: true,
    detectSessionInUrl: true // Enable OAuth callback detection
  }
})

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          slug: string
          name: string
          storefront_enabled: boolean
          subscription_tier: string
          created_at: string
          updated_at: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          unit: 'lb' | 'ea'
          pricePer: number
          qty: number
          image: string | null
          category: string | null
          is_online: boolean | null
          tenant_id: string
          updatedAt: string
        }
      }
      storefront_settings: {
        Row: {
          tenant_id: string
          template_id: string
          primary_color: string
          accent_color: string
          logo_url: string
          hero_image_url: string
          hero_heading: string
          hero_subtitle: string
          farm_name: string
          farm_description: string
          contact_email: string
          contact_phone: string
          allow_shipping: boolean
          allow_farm_pickup: boolean
          allow_farmers_market_pickup: boolean
          allow_dropoff: boolean
          allow_other: boolean
          pickup_locations: Array<{name: string; address: string}>
          enable_card: boolean
          enable_venmo: boolean
          enable_zelle: boolean
          venmo_handle: string
          zelle_instructions: string
          created_at: string
          updated_at: string
        }
      }
      orders: {
        Row: {
          id: string
          tenant_id: string
          status: string
          customer_name: string
          customer_email: string
          customer_phone: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          payment_method: string | null
          payment_provider: string | null
          fulfillment_method: string
          pickup_location: string | null
          pickup_date: string | null
          notes: string | null
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          status?: string
          customer_name: string
          customer_email: string
          customer_phone?: string | null
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          payment_method?: string | null
          payment_provider?: string | null
          fulfillment_method: string
          pickup_location?: string | null
          pickup_date?: string | null
          notes?: string | null
          source?: string
          created_at?: string
          updated_at?: string
        }
      }
      order_lines: {
        Row: {
          id: string
          order_id: string
          tenant_id: string
          product_id: string
          product_name: string
          quantity: number
          weight_lbs: number | null
          price_per_lb_cents: number | null
          price_per_unit_cents: number | null
          line_total_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          tenant_id: string
          product_id: string
          product_name: string
          quantity: number
          weight_lbs?: number | null
          price_per_lb_cents?: number | null
          price_per_unit_cents?: number | null
          line_total_cents: number
          created_at?: string
        }
      }
    }
  }
}