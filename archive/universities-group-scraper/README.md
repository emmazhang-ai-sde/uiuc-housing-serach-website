# Phase 5.2.2 — Universities Group Scraper

**Created: 2026-07-04**  
**Updated: 2026-10-03**

> Scraper-specific commands and modes for Universities Group. Part of [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md); see that doc for the full pipeline (normalize/geocode) and shared raw-file/archive behavior. Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

## Current Strategy

Universities Group moved its public site to a Next.js frontend backed by a signed WordPress custom API. The old DOM scraper waited on `/building-list/`, parsed `div.property-list` cards, and visited each detail page. That no longer works: `/building-list/` hydrates client-side, the old selectors are gone, and `networkidle` can hang on third-party tracking requests.

The current scraper calls the same public read-only API endpoints used by the frontend:

```text
https://admin.ugroupcu.com/wp-json/custom/v1/propertyfilters
https://admin.ugroupcu.com/wp-json/custom/v1/allproperties?page=N
```

Requests include the frontend's public HMAC headers:

```text
X-API-Key
X-Timestamp
X-Signature
```

`allproperties` returns paginated property rows with nested `property_details` unit/floorplan rows. Those rows include price, price per occupant, availability IDs, unit title, bed ID, baths, roommate matching, photos, floorplans, descriptions, and coordinates. The scraper maps those fields into the existing raw schema consumed by `pipeline.normalize`.

## Commands

Run from the project root:

```bash
source .venv/bin/activate
.venv/bin/python scrapers/universities_group.py
```

Then continue the normal pipeline:

```bash
.venv/bin/python -m pipeline.normalize
.venv/bin/python -m pipeline.geocode
```

`--retry-missing` is still accepted for backwards compatibility, but it is now a no-op. The API scraper fetches every page directly and should either complete the paginated run or fail before writing partial data.

## Output

```text
data/universities_group_raw.json
data/raw_archive/universities_group_raw_YYYY-MM-DD_HHMMSS.json
```

The canonical `data/universities_group_raw.json` is overwritten every run and is the only UG raw file that `pipeline.normalize` reads. The archive file is timestamped and complete when the API run succeeds.

## Field Mapping

| Raw field | API source |
|---|---|
| `address` | `streat_address`, `city`, `state`, `zipcode` |
| `url` | `https://ugroupcu.com/property-details/<seo_url>` |
| `photo_url` | `property_images/property/thumb/<fileupload>` |
| `brochure_url` | `property_images/property/floorplan/<floor_plan>` |
| `availability` | `property_details[*].available_now/soon/next` mapped through `propertyfilters.availability` |
| `availability_summary` | property `line1_desc` |
| `area` | property `area` IDs mapped through `propertyfilters.area` |
| `amenities` | property `feature` IDs mapped through `propertyfilters.features` |
| `price_total` | `property_details[*].tot_price` |
| `price_per_bed` | `property_details[*].price_per_occupant` |
| `beds` | parsed from unit title/name, with `Studio` mapped to `0` |
| `baths` | `property_details[*].bathrooms` |
| `lat`, `lng` | property `latitude`, `longitude` |

## Known Quirks

- Some availability values are comma-separated IDs. The scraper maps known IDs through `propertyfilters`; unknown special IDs are ignored because the property-level `line1_desc` still carries the human-facing note.
- Some leased unit rows do not publish prices. That is expected and downstream normalization keeps them as no-price leased listings.
- `streat_address` is misspelled in the API and intentionally used as-is.

## Rough Timing

The API currently returns 162 properties over 14 pages and runs in seconds. No Playwright browser context, crawl delay, or Incapsula warm-up is needed.
