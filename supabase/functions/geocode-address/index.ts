// @ts-ignore: Deno deploy provides these remote modules at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore: Deno deploy provides these remote modules at runtime
import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

declare const Deno: { env: { get(key: string): string | undefined } }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeliveryZone {
  id: string
  label: string
  min_miles: number
  max_miles: number
  charge_cents: number
  enabled: boolean
  sort_order: number
}

interface GeocodeRequest {
  address: string
  tenant_id?: string
  calculate_distance?: boolean
}

interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
}

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocodeAddress(address: string, apiKey: string): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    console.error('Geocoding failed:', data.status, data.error_message)
    return null
  }

  const result = data.results[0]
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formatted_address: result.formatted_address,
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: GeocodeRequest = await req.json()

    if (!body.address || body.address.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: 'Address is required (min 5 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geocoded = await geocodeAddress(body.address, apiKey)
    if (!geocoded) {
      return new Response(
        JSON.stringify({ error: 'Could not geocode address. Please check the address and try again.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!body.tenant_id || !body.calculate_distance) {
      return new Response(
        JSON.stringify({
          lat: geocoded.lat,
          lng: geocoded.lng,
          formatted_address: geocoded.formatted_address,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: settings, error: settingsError } = await supabase
      .from('storefront_settings')
      .select('delivery_origin_lat, delivery_origin_lng, delivery_zones')
      .eq('tenant_id', body.tenant_id)
      .single()

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: 'Tenant delivery settings not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!settings.delivery_origin_lat || !settings.delivery_origin_lng) {
      return new Response(
        JSON.stringify({ error: 'Tenant has not configured a delivery origin address' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let distanceMiles: number
    let driveTime: string | null = null

    try {
      const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${settings.delivery_origin_lat},${settings.delivery_origin_lng}&destinations=${geocoded.lat},${geocoded.lng}&units=imperial&key=${apiKey}`
      const dmRes = await fetch(dmUrl)
      const dmData = await dmRes.json()

      const element = dmData?.rows?.[0]?.elements?.[0]
      if (element?.status === 'OK' && element.distance?.value) {
        distanceMiles = element.distance.value / 1609.34
        driveTime = element.duration?.text ?? null
      } else {
        console.warn('Distance Matrix element not OK, falling back to Haversine:', element?.status)
        distanceMiles = haversineDistanceMiles(
          settings.delivery_origin_lat, settings.delivery_origin_lng,
          geocoded.lat, geocoded.lng
        )
      }
    } catch (dmErr) {
      console.warn('Distance Matrix API failed, falling back to Haversine:', dmErr)
      distanceMiles = haversineDistanceMiles(
        settings.delivery_origin_lat, settings.delivery_origin_lng,
        geocoded.lat, geocoded.lng
      )
    }

    const zones: DeliveryZone[] = settings.delivery_zones || []
    const matchedZone = zones
      .filter((z) => z.enabled)
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((z) => distanceMiles >= z.min_miles && distanceMiles < z.max_miles)

    return new Response(
      JSON.stringify({
        lat: geocoded.lat,
        lng: geocoded.lng,
        formatted_address: geocoded.formatted_address,
        distance_miles: Math.round(distanceMiles * 10) / 10,
        drive_time: driveTime,
        matched_zone: matchedZone ? {
          id: matchedZone.id,
          label: matchedZone.label,
          charge_cents: matchedZone.charge_cents,
          min_miles: matchedZone.min_miles,
          max_miles: matchedZone.max_miles,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('geocode-address error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
