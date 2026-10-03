# scrapers/universities_group.py
# Universities Group — UIUC Housing Scraper
#
# Strategy:
#   Universities Group moved its public site to a Next.js frontend backed by a
#   signed WordPress custom API. The old DOM scraper waited on /building-list/
#   and then parsed detail pages; that page now hydrates from API calls and the
#   previous selectors are gone. This scraper calls the same signed API as the
#   frontend:
#
#     GET /wp-json/custom/v1/propertyfilters
#     GET /wp-json/custom/v1/allproperties?page=N
#
#   allproperties returns every active property with nested unit/floorplan rows,
#   including price, availability IDs, photos, coordinates, and descriptions.
#   We map those API fields into the existing raw schema consumed by
#   pipeline.normalize.
#
# Run:    python scrapers/universities_group.py
# Output: data/universities_group_raw.json
#         data/raw_archive/universities_group_raw_YYYY-MM-DD_HHMMSS.json
# Save/archive logic lives in scrapers/_archive.py

import argparse
import hashlib
import hmac
import html
import json
import re
import time
import urllib.error
import urllib.request
from typing import Any

from bs4 import BeautifulSoup

from _archive import save_scrape

API_BASE_URL = "https://admin.ugroupcu.com/wp-json/custom/v1"
PUBLIC_BASE_URL = "https://ugroupcu.com"
PROPERTY_IMAGE_BASE_URL = "https://admin.ugroupcu.com/property_images/property"

# These credentials are shipped in UG's public frontend bundle and are required
# for the public read-only endpoints above.
API_KEY = "UG-API-9f4d82a1e7"
API_SECRET = "9d8b53b0ef40d79368d97c84d8c7d5a2574b50d4a0a2cb42c51d0e7c71e2f06b"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

UNKNOWN_AVAILABILITY_LABELS = {
    # These IDs currently appear in comma-separated API values but are omitted
    # from propertyfilters. The property-level line1_desc still carries the
    # human-facing special, so unknown IDs are ignored rather than guessed.
    "30": "",
    "61": "",
}


def signed_api_get(endpoint: str, retries: int = 3) -> dict[str, Any]:
    """Fetch one UG custom API endpoint using the frontend's HMAC headers."""
    endpoint = endpoint.lstrip("/")
    timestamp = str(int(time.time()))
    signature_path = f"/custom/v1/{endpoint.split('?')[0]}"
    signature = hmac.new(
        API_SECRET.encode(),
        f"{timestamp}{signature_path}".encode(),
        hashlib.sha256,
    ).hexdigest()

    req = urllib.request.Request(
        f"{API_BASE_URL}/{endpoint}",
        headers={
            "Accept": "application/json, text/plain, */*",
            "Origin": PUBLIC_BASE_URL,
            "Referer": f"{PUBLIC_BASE_URL}/",
            "User-Agent": USER_AGENT,
            "X-API-Key": API_KEY,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
    )

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == retries:
                raise RuntimeError(f"UG API request failed for {endpoint}: {e}") from e
            time.sleep(1.5 * attempt)

    raise RuntimeError(f"UG API request failed for {endpoint}")


def clean_text(value: str) -> str:
    if not value:
        return ""
    soup = BeautifulSoup(value, "html.parser")
    text = soup.get_text(" ", strip=True)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def parse_price(value: str | None) -> str:
    if not value:
        return ""
    match = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    if not match:
        return ""
    amount = int(float(match.group(0)))
    return str(amount) if amount > 0 else ""


def parse_float_str(value: str | None) -> str:
    if not value:
        return ""
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    return match.group(0) if match else ""


def parse_beds(unit_type: str, unit_name: str = "") -> int:
    text = f"{unit_type} {unit_name}".lower()
    if "studio" in text:
        return 0
    match = re.search(r"(\d+)\s*(?:bedroom|bedrooms|bed\b|br\b)", text, re.IGNORECASE)
    return int(match.group(1)) if match else 0


def map_by_id(rows: list[dict], id_key: str, value_key: str) -> dict[str, str]:
    return {str(row.get(id_key, "")): str(row.get(value_key, "")) for row in rows}


def split_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip() and part.strip() != "0"]


def labels_for_ids(value: str | None, lookup: dict[str, str]) -> list[str]:
    labels: list[str] = []
    for id_ in split_ids(value):
        label = lookup.get(id_) or UNKNOWN_AVAILABILITY_LABELS.get(id_, "")
        if label and label not in labels:
            labels.append(label)
    return labels


def availability_for_unit(unit: dict, prop: dict, availability_lookup: dict[str, str]) -> str:
    labels: list[str] = []
    for key in ("available_now", "available_soon", "available_next"):
        for label in labels_for_ids(unit.get(key), availability_lookup):
            if label not in labels:
                labels.append(label)

    if any("leased" in label.lower() for label in labels):
        return "Leased"

    if labels:
        return ", ".join(labels)

    summary = str(prop.get("line1_desc") or "").strip()
    if "leased" in summary.lower():
        return "Leased"
    return summary


def photo_url_for(prop: dict) -> str:
    filename = str(prop.get("fileupload") or "").strip()
    if not filename:
        return ""
    return f"{PROPERTY_IMAGE_BASE_URL}/thumb/{filename}"


def floor_plan_url_for(unit: dict) -> str:
    filename = str(unit.get("floor_plan") or "").strip()
    if not filename:
        return ""
    return f"{PROPERTY_IMAGE_BASE_URL}/floorplan/{filename}"


def build_lookup_tables(filters: dict) -> dict[str, dict[str, str]]:
    return {
        "availability": map_by_id(filters.get("availability", []), "availability_id", "availability_name"),
        "area": map_by_id(filters.get("area", []), "area_id", "area_name"),
        "beds": map_by_id(filters.get("beds", []), "units_id", "units_name"),
        "features": map_by_id(filters.get("features", []), "feature_id", "feature_name"),
        "type": map_by_id(filters.get("type", []), "type_id", "type_name"),
    }


def area_for(prop: dict, area_lookup: dict[str, str]) -> str:
    labels = [area_lookup.get(id_, "") for id_ in split_ids(prop.get("area"))]
    labels = [label for label in labels if label]
    return ", ".join(dict.fromkeys(labels))


def amenities_for(prop: dict, feature_lookup: dict[str, str]) -> str:
    labels = [feature_lookup.get(id_, "") for id_ in split_ids(prop.get("feature"))]
    labels = [label for label in labels if label]
    return ", ".join(dict.fromkeys(labels))


def property_type_for(prop: dict, type_lookup: dict[str, str]) -> str:
    raw = type_lookup.get(str(prop.get("property_type") or ""), "")
    if raw.lower().startswith("house"):
        return "House"
    return "Apartment"


def normalize_property(prop: dict, lookups: dict[str, dict[str, str]]) -> list[dict]:
    address = ", ".join(
        part for part in [
            str(prop.get("streat_address") or prop.get("page_heading") or "").strip(),
            str(prop.get("city") or "").strip(),
            str(prop.get("state") or "").strip(),
            str(prop.get("zipcode") or "").strip(),
        ] if part
    )
    if not address:
        address = str(prop.get("page_heading") or "").strip()

    area = area_for(prop, lookups["area"])
    amenities = amenities_for(prop, lookups["features"])
    property_type = property_type_for(prop, lookups["type"])
    availability_summary = str(prop.get("line1_desc") or "").strip()
    tagline = str(prop.get("line2_desc") or "").strip()
    description = clean_text(prop.get("full_description") or prop.get("description") or "")
    url = f"{PUBLIC_BASE_URL}/property-details/{prop.get('seo_url', '').strip()}"
    photo_url = photo_url_for(prop)

    listings: list[dict] = []
    for unit in prop.get("property_details") or []:
        unit_type = str(unit.get("title") or unit.get("unit_name") or "").strip()
        unit_name = str(unit.get("unit_name") or lookups["beds"].get(str(unit.get("units") or ""), "")).strip()
        beds = parse_beds(unit_type, unit_name)
        baths = parse_float_str(unit.get("bathrooms"))
        price_total = parse_price(unit.get("tot_price"))
        price_per_bed = parse_price(unit.get("price_per_occupant"))
        availability = availability_for_unit(unit, prop, lookups["availability"])

        unit_comments = clean_text(unit.get("unit_comments") or "")
        full_description = " ".join(part for part in [description, unit_comments] if part)
        roommate_match = str(unit.get("roommate_check") or "").upper() == "Y"
        brochure_url = floor_plan_url_for(unit)

        listings.append({
            "company": "Universities Group",
            "address": address,
            "area": area,
            "property_type": property_type,
            "roommate_match": roommate_match,
            "unit_type": unit_type,
            "beds": str(beds),
            "baths": baths,
            "sqft": "",
            "price_total": price_total,
            "price_per_bed": price_per_bed,
            "availability": availability,
            "url": url,
            "photo_url": photo_url,
            "availability_summary": availability_summary,
            "tagline": tagline,
            "description": full_description,
            "amenities": amenities,
            "lease_dates": availability,
            "utility_fees": "",
            "brochure_url": brochure_url,
            "lat": parse_float_str(prop.get("latitude")),
            "lng": parse_float_str(prop.get("longitude")),
            "text": (
                f"{address}. "
                f"{unit_type}: {beds} bed, {baths} bath. "
                f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
                f"Availability: {availability}. "
                f"Area: {area}. "
                f"Company: Universities Group. "
                f"Link: {url}"
            ),
        })

    return listings


def fetch_all_properties() -> list[dict]:
    first_page = signed_api_get("allproperties?page=1")
    total_pages = int(first_page.get("total_pages") or 1)
    properties = list(first_page.get("properties") or [])
    print(f"Loaded page 1/{total_pages}: {len(properties)} properties")

    for page in range(2, total_pages + 1):
        data = signed_api_get(f"allproperties?page={page}")
        page_properties = data.get("properties") or []
        print(f"Loaded page {page}/{total_pages}: {len(page_properties)} properties")
        properties.extend(page_properties)
        time.sleep(0.25)

    total_records = int(first_page.get("total_records") or len(properties))
    if len(properties) != total_records:
        raise RuntimeError(f"Expected {total_records} UG properties, got {len(properties)}")
    return properties


def scrape_universities_group(retry_missing: bool = False) -> tuple[list[dict], int]:
    if retry_missing:
        print("--retry-missing is no longer needed; the signed API returns paginated data directly.")

    filters = signed_api_get("propertyfilters")
    lookups = build_lookup_tables(filters)
    properties = fetch_all_properties()

    listings: list[dict] = []
    skipped = 0
    for prop in properties:
        prop_listings = normalize_property(prop, lookups)
        if not prop_listings:
            skipped += 1
            continue
        listings.extend(prop_listings)

    print(f"\nScraped {len(listings)} unit listing(s) from {len(properties)} properties")
    if skipped:
        print(f"Skipped {skipped} properties with no unit data")
    return listings, 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--retry-missing",
        action="store_true",
        help="Accepted for backwards compatibility; the current API scraper fetches all pages directly.",
    )
    args = parser.parse_args()

    data, failed = scrape_universities_group(retry_missing=args.retry_missing)
    save_scrape(data, "universities_group", failed)
