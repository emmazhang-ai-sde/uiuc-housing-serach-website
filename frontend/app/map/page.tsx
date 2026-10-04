"use client"

import { useEffect, useState  } from "react"
import dynamic from "next/dynamic"
import AppHeader from "@/components/AppHeader"
import FilterChips from "@/components/FilterChips"
import MapColorPicker from "@/components/MapColorPicker"
import { fetchAllListings } from "@/lib/api"
import type { Listing } from "@/lib/api"
import { DrawerContent } from "@/components/PropertyDrawer"
import { useMapTheme } from "@/hooks/useMapTheme"
import { useFilters } from "@/contexts/FiltersContext"
import { logEvent } from "@/lib/logEvent"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

export default function MapPage() {
  const { filters, setFilters }     = useFilters()
  const { theme, presets, custom, applyDefault, applyCustom, setColors, setGrain, reset } = useMapTheme()
  const [listings, setListings]     = useState<Listing[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)

  function handleSelectListing(listing: Listing | null) {
    setSelectedListing(listing)
    if (listing) logEvent("listing_view", { url: listing.url, company: listing.company, source: "map" })
  }

  // Escape closes the detail panel, matching the Card view drawer.
  useEffect(() => {
    if (!selectedListing) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedListing(null) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedListing])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetchAllListings(filters)
      .then(data => {
        if (cancelled) return
        setListings(data)
        setLoading(false)
        logEvent("map_search", { filters, result_count: data.length })
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })

    return () => { cancelled = true }
  }, [filters])

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Full-bleed map fills the entire background */}
      <MapView
        listings={listings}
        filters={filters}
        theme={theme}
        showBuildingSticker
        mapHeight="100%"
        className="absolute inset-0 w-full h-full"
        selectedListing={selectedListing}
        onSelectListing={handleSelectListing}
      />

      {/* Top tool band, matching the Card view's deep-brown toolbar treatment. */}
      <div className="absolute top-0 inset-x-0 z-30 bg-[#E0CCB2] px-4 pb-5 pt-2 shadow-[0_16px_40px_-28px_rgba(53,20,11,0.45)]">
        <div className="pointer-events-none [&_header>div]:pointer-events-auto">
          <AppHeader />
        </div>
        <div className="mt-2 flex justify-center">
          <FilterChips
            filters={filters}
            onChange={setFilters}
            resultCount={error ? null : listings.length}
            loading={loading}
            trailing={
              <MapColorPicker
                theme={theme}
                presets={presets}
                custom={custom}
                onApplyDefault={applyDefault}
                onApplyCustom={applyCustom}
                onSetColors={setColors}
                onSetGrain={setGrain}
                onReset={reset}
              />
            }
          />
        </div>
      </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-white/90 rounded-2xl border border-mist-100 shadow-md px-5 py-3 text-sm text-neutral-500">
              Loading listings…
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && listings.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-white/90 rounded-2xl border border-mist-100 shadow-md px-5 py-3 text-sm text-neutral-500">
              No listings match the current filters.
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-white/90 rounded-2xl border border-mist-100 shadow-md px-5 py-3 text-sm text-[#FF465A]">
              Failed to load listings. Please try again.
            </div>
          </div>
        )}

        {/* Listing detail panel — same content as the Card view drawer, but no
            backdrop so the map stays interactive while it is open */}
        <div
          className={`absolute inset-y-0 right-0 z-40 w-full max-w-[420px] bg-white shadow-2xl overflow-y-auto transition-transform duration-300 ease-in-out ${
            selectedListing ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedListing && (
            <DrawerContent listing={selectedListing} onClose={() => setSelectedListing(null)} />
          )}
        </div>
    </div>
  )
}
