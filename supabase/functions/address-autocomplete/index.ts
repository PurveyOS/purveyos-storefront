const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

type AutocompleteRequest = {
  query?: string
  country?: string
  limit?: number
}

declare const Deno: { env: { get(key: string): string | undefined }, serve: (handler: (req: Request) => Response | Promise<Response>) => void }

Deno.serve(async (req: Request) => {
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

    const body: AutocompleteRequest = await req.json()
    const query = body.query?.trim() ?? ''
    const country = (body.country ?? 'us').toLowerCase()
    const limit = Math.min(Math.max(body.limit ?? 6, 1), 10)

    if (query.length < 4) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
    url.searchParams.set('input', query)
    url.searchParams.set('types', 'address')
    url.searchParams.set('components', `country:${country}`)
    url.searchParams.set('key', apiKey)

    const response = await fetch(url)
    const payload = await response.json()

    if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
      console.error('address-autocomplete failed:', payload.status, payload.error_message)
      return new Response(
        JSON.stringify({ error: payload.error_message || `Autocomplete failed: ${payload.status}` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const suggestions = (payload.predictions ?? [])
      .slice(0, limit)
      .map((item: any) => ({
        description: item.description,
        place_id: item.place_id,
      }))

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('address-autocomplete error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
