# Phase 5.2 — Data Refresh Runbook

**Created: 2026-07-04**

> The current end-to-end operational runbook for the multi-company pipeline. For the original design rationale (snapshots, raw archive, incremental Chroma), see [Phase 5.1 — Snapshot Versioning](phase-5.1-snapshot-versioning.md). Per-scraper commands and modes live in [Phase 5.2.1 — Green Street Scraper](phase-5.2.1-green-street-scraper.md) and [Phase 5.2.2 — Universities Group Scraper](phase-5.2.2-universities-group-scraper.md). Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

How to pull fresh listing data end to end: scrape each active company, normalize into a dated SQLite snapshot, geocode new addresses, and commit the snapshot that the backend reads.

## Prerequisites

- Virtualenv activated:
  ```bash
  source .venv/bin/activate
  ```
- Run every command from the **project root**.

## Full pipeline (in order)

```bash
# 1. Scrape (run each company once). See individual scraper docs for modes and flags.
#    Writes data/<company>_raw.json (overwritten each run, the "latest" file)
#    plus data/raw_archive/<company>_raw_YYYY-MM-DD_HHMMSS.json (never overwritten).
.venv/bin/python scrapers/bankier.py
.venv/bin/python scrapers/green_street.py --fresh
.venv/bin/python scrapers/jsj.py
.venv/bin/python scrapers/mhm.py
.venv/bin/python scrapers/octave.py
.venv/bin/python scrapers/roland.py
.venv/bin/python scrapers/seven07.py
.venv/bin/python scrapers/smile.py
.venv/bin/python scrapers/universities_group.py

# 2. Normalize: read every data/*_raw.json, clean, write snapshots/listings_<today>.db.
#    If the data is unchanged vs the previous snapshot, nothing is written.
.venv/bin/python -m pipeline.normalize

# 3. Geocode: fill lat/lng for new addresses in the latest snapshot.
#    Already-geocoded addresses are skipped. See Phase 5.3 if a pin ends up
#    outside Champaign-Urbana — that's a known Nominatim failure mode, not a bug here.
.venv/bin/python -m pipeline.geocode

# 4. Commit the scraper changes, new raw snapshots, latest pointer, and DB snapshot before pushing.
#    Railway's filesystem resets on every deploy, so anything the backend reads
#    at runtime must be committed, not just present locally.
git add -u data snapshots/latest.txt
git add snapshots/raw_<today>_*.json snapshots/listings_<today>.db
git commit -m "data: refresh listings <today>"
```

**Why step 4 is not optional:** `GET /api/listings` (Card/Map page data) and `GET /api/status` (About page stat line) both read `snapshots/listings_<today>.db` directly (`SNAPSHOTS_DIR` in `config.py`). `.gitignore`'s blanket `*.db` rule has an explicit `!snapshots/listings_*.db` exception for this reason; without committing the file, both endpoints silently degrade (`{"listings": []}` / null counts) instead of erroring, so the gap is easy to miss until someone notices Card/Map look empty in production.

**Re-running after a partial scrape failure (timeouts):** a scraper logging a few `⚠ Failed to load ...` lines is not a crash — the affected properties are simply left out of that run's output (never fabricated from old data), and the run keeps going. Re-run only the scraper(s) that had gaps, then repeat steps 2–3 as-is. The company that scraped cleanly does not need re-running. Universities Group is now API-backed and should either complete the paginated API run or fail before writing partial data.

```bash
# Green Street — plain re-run only fetches what's still missing (incremental fill, cheap):
.venv/bin/python scrapers/green_street.py

# Then repeat the rest of the pipeline:
.venv/bin/python -m pipeline.normalize
.venv/bin/python -m pipeline.geocode
```

Green Street is safe to run repeatedly — each pass narrows any detail-page enrichment gaps until nothing is missing. See [Phase 5.2.1](phase-5.2.1-green-street-scraper.md#partial-failures-and-how-to-re-run) for Green Street modes, plus `--fresh` if you want to force a full re-fetch instead of incremental fill. See [Phase 5.2.2](phase-5.2.2-universities-group-scraper.md) for the current Universities Group API flow.

## Order matters

- **Normalize runs after the scraper refreshes.** It merges all `data/*_raw.json` in one pass, so each refreshed company's latest raw file must exist first.
- **Geocode runs after normalize.** It reads the snapshot that `snapshots/latest.txt` points to, which normalize is responsible for producing/updating.

## Notes

- **Refreshing only one company still requires running normalize on both.** Normalize merges every `data/*_raw.json`. If you only re-scrape one company, the other's `_raw.json` keeps its previous contents and is merged in unchanged. There is no per-company normalize.
- **Unchanged data is skipped automatically.** Normalize diffs against the previous snapshot; if identical, it writes no new `.db` and leaves `latest.txt` untouched.
- **Two raw files per scrape, opposite behavior.** `data/<company>_raw.json` is overwritten every run (always the newest, and the only thing normalize reads). `data/raw_archive/` keeps one timestamped file per run and is never overwritten, so same-day re-runs accumulate rather than clobber. A run with missing properties is archived as `..._partial.json` and auto-removed once a later, complete run supersedes it (see `scrapers/_archive.py`). The archive is a local safety net and is gitignored.

## Where each scraper's changing data lives (why the two scrapers behave differently)

Green Street still fetches one cheap list page and optional detail pages. Universities Group no longer scrapes DOM pages; its Next.js frontend reads a signed WordPress custom API, and the scraper now calls that same API directly.

| | Primary source | Provides |
|---|---|---|
| **Green Street** | Listing page + detail pages | Listing page provides volatile price/availability/unit data; detail pages provide static enrichment. |
| **Universities Group** | Signed API `allproperties?page=N` | Property rows plus nested unit/floorplan rows, including price, availability IDs, beds, baths, photos, descriptions, and coordinates. |

- **Green Street** — the volatile fields already arrive on the list page (re-fetched fresh every run), so the detail pages carry only static enrichment. Detail pages that were already fetched can be safely reused/skipped on a re-run. Details, commands, and flags: [Phase 5.2.1](phase-5.2.1-green-street-scraper.md).
- **Universities Group** — the scraper signs the public API requests with the same headers used by the frontend, paginates through `allproperties`, and maps API fields into `data/universities_group_raw.json`. `--retry-missing` is kept only as a no-op compatibility flag. Details: [Phase 5.2.2](phase-5.2.2-universities-group-scraper.md).

The scrapers share the same underlying principle for handling a failed fetch — leave it as an honest gap, never fabricate it from old data — but the *scope* of that gap differs by source:

| | Scope of "empty" on a failed fetch |
|---|---|
| **Green Street** | Only the detail-page fields go blank (description/amenities/lease_dates/utility_fees/brochure_url). Core data — address, price, unit type, availability — is always present, since it's re-fetched from the list page every run regardless of detail-page success. |
| **Universities Group** | The API request fails before a partial file is saved, or the paginated response completes and writes a complete raw file. |

This is why a Green Street gap usually leaves the property visible but less enriched, while Universities Group is now treated as an all-or-nothing API refresh.

## Rough timing

| Step | Time | Notes |
|------|------|-------|
| `green_street.py` | several minutes | 10s crawl-delay per request (robots.txt); see [Phase 5.2.1](phase-5.2.1-green-street-scraper.md) for how re-runs get faster |
| `universities_group.py` | seconds | Signed API pagination, currently 14 pages; no Playwright/browser context |
| `pipeline.normalize` | seconds | pure local processing |
| `pipeline.geocode` | up to ~8 min on a full run | ~410 addresses × 1.1s; skips already-geocoded, so incremental runs are fast; see [Phase 5.3](phase-5.3-geocoding-manual-lookup.md) for known Nominatim failure modes |
