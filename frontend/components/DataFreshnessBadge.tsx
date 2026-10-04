"use client"

import { useEffect, useState } from "react"
import { fetchStatus } from "@/lib/api"

export default function DataFreshnessBadge() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchStatus()
      .then(status => {
        if (!cancelled) {
          setLastUpdated(formatSnapshotDateTime(status.last_scraped_at) ?? formatSnapshotDate(status.last_scraped))
        }
      })
      .catch(() => {
        if (!cancelled) setLastUpdated(null)
      })
    return () => { cancelled = true }
  }, [])

  if (!lastUpdated) return null

  return (
    <div className="fixed right-4 top-3 z-[95] flex flex-col items-end leading-none print:hidden">
      <span className="text-[11px] font-bold text-ink-900/50">
        Last updated
      </span>
      <span className="mt-1 text-[13px] font-bold text-ink-900">
        {lastUpdated}
      </span>
    </div>
  )
}

function formatSnapshotDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatSnapshotDate(value: string | null): string | null {
  if (!value) return null
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}
