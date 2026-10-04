export interface Listing {
  company: string
  address: string
  unit_type: string
  beds: number
  price_per_bed_low: number | null
  price_per_bed_high: number | null
  price_total_low: number | null
  price_total_high: number | null
  price_note: string               // e.g. Bankier: prices can't be scraped; note replaces price in all views
  availability: string
  is_available: boolean          // Phase 6: pre-computed in ingest.py
  area: string
  url: string
  lat: number | null             // Phase 7: geocoded coordinates
  lng: number | null
  photo_url: string              // Phase 8: exterior photo from /building-list/
  availability_summary: string   // Phase 8: property-level note e.g. "Available August 2026"
  tagline: string                // Phase 8: marketing tagline e.g. "LUXURY 1 BR! HUGE!"
  description: string            // Phase 8.2: full property description from detail page
  amenities: string              // Phase 8.2: comma-separated amenity tags
  lease_dates: string            // Phase 8.2: e.g. "Aug 21, 2026 – Jul 31, 2027"
  utility_fees: string           // Phase 8.2: e.g. "$55/bed includes water, internet, trash"
  brochure_url: string           // Phase 8.2: PDF brochure link, empty when absent
  property_type: string          // Phase 8.3: e.g. "Apartment", "House", "Townhouse"
}

// Shared listing filters used by Card and Map.
export interface Filters {
  beds: number[] | null
  availability_window:
    | "now"
    | "june_2026"
    | "july_2026"
    | "august_2026"
    | "january_2027"
    | "august_2027"
    | "leased"
    | null
  min_price_per_bed: number | null                    // floor
  max_price_per_bed: number | null                    // ceiling; the buffer below widens THIS end only
  company: string[] | null                            // multi-select: null or [] means every source
  buffer_type: "percent" | "fixed" | "exact" | null  // how the price buffer is applied
  buffer_value: number | null                         // % or $ amount; null when type is "exact"
  property_type: string | null                        // "Apartment" | "House" | "Townhouse"
  penthouse: boolean | null                           // sub-filter under Apartment
}

export const DEFAULT_FILTERS: Filters = {
  beds: null,
  availability_window: null,
  min_price_per_bed: null,
  max_price_per_bed: null,
  company: null,
  // Null until the user actually picks a tolerance. Both query paths read null as
  // "exact", so an untouched Max tolerance never silently widens the ceiling.
  buffer_type: null,
  buffer_value: null,
  property_type: null,
  penthouse: null,
}

export interface DataStatus {
  last_scraped: string | null
  last_scraped_at: string | null
  listing_count: number | null
  property_count: number | null
}

// Every caller swallows the rejection (the counts degrade to "…" placeholders
// rather than breaking the page), so warn here or the failure is invisible.
export async function fetchStatus(): Promise<DataStatus> {
  const res = await fetch(`/api/status`)
  if (!res.ok) {
    console.warn(
      `fetchStatus: /api/status returned ${res.status}. Listing/property counts ` +
      `will render as "…". Is the Python backend running, and is BACKEND_URL set?`
    )
    throw new Error(`API error: ${res.status}`)
  }
  return res.json()
}

// Both listing fetchers send the identical filter set, so the query string is
// built once here. They used to duplicate this block, which is how `company`
// and `min_price_per_bed` could easily have been added to one and not the other.
// Repeated params (beds, company) are appended, matching FastAPI's list[] Query.
function buildListingParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.beds?.length)              filters.beds.forEach(b => params.append("beds", String(b)))
  if (filters.company?.length)           filters.company.forEach(c => params.append("company", c))
  if (filters.min_price_per_bed != null) params.set("min_price_per_bed", String(filters.min_price_per_bed))
  if (filters.max_price_per_bed != null) params.set("max_price_per_bed", String(filters.max_price_per_bed))
  if (filters.buffer_type)               params.set("buffer_type", filters.buffer_type)
  if (filters.buffer_value != null)      params.set("buffer_value", String(filters.buffer_value))
  if (filters.availability_window)       params.set("availability_window", filters.availability_window)
  if (filters.property_type)             params.set("property_type", filters.property_type)
  if (filters.penthouse != null)         params.set("penthouse", String(filters.penthouse))
  return params
}

// Sort keys accepted by the backend's SORT_ORDERS map (backend/main.py). Kept out
// of Filters on purpose: Filters is also the chat/map search payload, where a
// result ordering has no meaning.
export type ListingSort = "beds" | "price_asc" | "price_desc" | "company"

// Phase 6: accepts explicit filters alongside the NL query
// token: Supabase JWT access token — passed as Authorization header to FastAPI
export async function fetchAllListings(filters: Filters, sort?: ListingSort): Promise<Listing[]> {
  const params = buildListingParams(filters)
  if (sort) params.set("sort", sort)

  const res = await fetch(`/api/listings?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  return data.listings as Listing[]
}

export interface ListingsPage {
  listings: Listing[]
  total: number
}

// Paginated variant of fetchAllListings — used by the Card view's browse-all grid so we
// don't have to pull every matching listing into the DOM at once. Ordering happens on the
// backend (defaults to beds ascending) because a page holds only a slice of the matches.
export async function fetchListingsPage(filters: Filters, page: number, pageSize: number, sort?: ListingSort): Promise<ListingsPage> {
  const params = buildListingParams(filters)
  params.set("page", String(page))
  params.set("page_size", String(pageSize))
  if (sort) params.set("sort", sort)

  const res = await fetch(`/api/listings?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  return { listings: data.listings as Listing[], total: (data.total as number) ?? data.listings.length }
}
