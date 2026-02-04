// src/hooks/useStorefrontSettings.ts
// ============================================================================
// Lightweight hook for cart/checkout pages
// Only fetches tenant settings, not all products
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface StorefrontSettings {
  primaryColor: string
  accentColor: string
  template_id: string
  farm_name: string
  hero_heading: string
  hero_subtitle: string
  [key: string]: any
}

export function useStorefrontSettings(tenantId: string | null) {
  const [settings, setSettings] = useState<StorefrontSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    const fetchSettings = async () => {
      try {
        setLoading(true)
        
        const { data, error: err } = await supabase
          .from('storefront_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .single()

        if (err) throw err

        // Map to expected format
        setSettings({
          primaryColor: data.primary_color || '#0f6fff',
          accentColor: data.accent_color || '#06b6d4',
          template_id: data.template_id || 'minimal',
          farm_name: data.farm_name || '',
          hero_heading: data.hero_heading || '',
          hero_subtitle: data.hero_subtitle || '',
          ...data
        })
      } catch (err) {
        console.error('Error fetching storefront settings:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch settings'))
        // Set defaults on error
        setSettings({
          primaryColor: '#0f6fff',
          accentColor: '#06b6d4',
          template_id: 'minimal',
          farm_name: '',
          hero_heading: '',
          hero_subtitle: '',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [tenantId])

  return { settings, loading, error }
}
