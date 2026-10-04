import { toBlob } from "html-to-image"
import { Filters } from "@/lib/api"

export function buildExportSlug(filters: Filters): string {
  const parts: string[] = []

  if (filters.property_type) {
    parts.push(filters.property_type.toLowerCase().replace(/\s+/g, "-"))
  }

  if (filters.beds?.length) {
    const sorted = [...filters.beds].sort((a, b) => a - b)
    parts.push(sorted.map(b => b === 0 ? "studio" : `${b}br`).join("-"))
  }

  if (filters.availability_window) {
    const avMap: Record<string, string> = {
      now:          "now",
      june_2026:    "jun2026",
      july_2026:    "jul2026",
      august_2026:  "aug2026",
      january_2027: "jan2027",
      august_2027:  "aug2027",
      leased:       "leased",
    }
    parts.push(avMap[filters.availability_window] ?? filters.availability_window)
  }

  if (filters.company?.length) {
    const companyAbbr: Record<string, string> = {
      "Green Street Realty":  "gsr",
      "University Group":     "ug",
      "Smile Student Living": "smile",
      "MHM Properties":       "mhm",
      "Seven07":              "seven07",
      "Bankier Apartments":   "bankier",
      "Roland Realty":        "roland",
      "JSJ Property Management": "jsj",
      "Octave":               "octave",
    }
    // Multi-select: abbreviate each pick and join, so a two-company export reads
    // "gsr-ug". Past three the count keeps the filename from running away.
    const slug = (c: string) =>
      companyAbbr[c] ?? c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    parts.push(
      filters.company.length > 3
        ? `${filters.company.length}sources`
        : filters.company.map(slug).join("-")
    )
  }

  if (filters.min_price_per_bed != null) {
    parts.push(`min${filters.min_price_per_bed}`)
  }

  if (filters.max_price_per_bed != null) {
    parts.push(`max${filters.max_price_per_bed}`)
  }

  return parts.length ? parts.join("-") : "all"
}

async function fetchDataUrl(src: string): Promise<string | null> {
  try {
    // Route external images through a server-side proxy to bypass CORS restrictions.
    // Same-origin URLs (e.g. /logos/...) are fetched directly.
    const url = src.startsWith("http")
      ? `/api/proxy-image?url=${encodeURIComponent(src)}`
      : src
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// 1×1 transparent GIF — a safe data URL placeholder that html-to-image can inline
// without making any network requests.
const BLANK_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

// Pre-inline <img> elements so SVG foreignObject can render them.
// Images that can't be fetched (CORS-blocked) get their src replaced with a blank
// data URL — keeping the external URL on the element would cause html-to-image's
// internal SVG pipeline to attempt the load and reject with an error event.
async function inlineImages(element: HTMLElement) {
  const imgs = Array.from(element.querySelectorAll("img")) as HTMLImageElement[]
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") ?? ""
      if (!src || src.startsWith("data:")) return
      const dataUrl = await fetchDataUrl(src)
      if (dataUrl) {
        img.src = dataUrl
      } else {
        img.src = BLANK_GIF
        img.style.visibility = "hidden"
        const placeholder = document.createElement("div")
        placeholder.style.cssText =
          "position:absolute;inset:0;background:#e5e5e5;border-radius:inherit;"
        if (img.parentElement) {
          img.parentElement.style.position = "relative"
          img.parentElement.appendChild(placeholder)
        }
      }
    })
  )
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function elementToPngBlob(element: HTMLElement, scale = 2): Promise<Blob> {
  await inlineImages(element)
  const blob = await toBlob(element, {
    pixelRatio: scale,
    backgroundColor: "#f5f5f5",
    skipFonts: false,
  })
  if (!blob) throw new Error("html-to-image toBlob returned null")
  return blob
}

export async function downloadElementPng(element: HTMLElement, filename: string) {
  const blob = await elementToPngBlob(element)
  downloadBlob(blob, filename)
}
