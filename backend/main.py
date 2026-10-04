import os
import sqlite3
import jwt
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import SNAPSHOTS_DIR


app = FastAPI()

_security   = HTTPBearer(auto_error=False)
_DEV_MODE   = os.getenv("DEV_MODE", "false").lower() == "true"

# Supabase signs access tokens with asymmetric ES256 keys (JWT Signing Keys), not the
# legacy HS256 shared secret. Verify against the project's public JWKS endpoint.
# PyJWKClient caches fetched keys, so this doesn't hit the network per request.
_SUPABASE_URL = os.getenv("SUPABASE_URL", "https://uknyhpwzvdevxfxkpxmy.supabase.co")
_jwks_client  = jwt.PyJWKClient(f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    if _DEV_MODE:
        return
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(credentials.credentials)
        jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

_raw = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw.split(",")] if _raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/status")
def status():
    latest_txt = os.path.join(SNAPSHOTS_DIR, "latest.txt")
    if not os.path.exists(latest_txt):
        return {"last_scraped": None, "last_scraped_at": None, "listing_count": None, "property_count": None}
    date_str = open(latest_txt).read().strip()
    db_path = os.path.join(SNAPSHOTS_DIR, f"listings_{date_str}.db")
    if not os.path.exists(db_path):
        return {
            "last_scraped": date_str,
            "last_scraped_at": _file_timestamp(latest_txt),
            "listing_count": None,
            "property_count": None,
        }
    con = sqlite3.connect(db_path)
    row = con.execute(
        "SELECT COUNT(*) as listing_count, COUNT(DISTINCT address) as property_count FROM listings"
    ).fetchone()
    con.close()
    return {
        "last_scraped": date_str,
        "last_scraped_at": _file_timestamp(db_path),
        "listing_count": row[0],
        "property_count": row[1],
    }


def _file_timestamp(path: str) -> str:
    return datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).isoformat(timespec="minutes")


# Allowed ORDER BY clauses for /api/listings, keyed by the `sort` query param.
# Keep these keys in sync with SORT_OPTIONS in frontend/components/SortButton.tsx.
SORT_ORDERS: dict[str, str] = {
    "beds":       "(beds IS NULL) ASC, beds ASC, price_per_bed_low ASC",
    "price_asc":  "(price_per_bed_low IS NULL) ASC, price_per_bed_low ASC, beds ASC",
    "price_desc": "(price_per_bed_low IS NULL) ASC, price_per_bed_low DESC, beds ASC",
    "company":    "company ASC, beds ASC, price_per_bed_low ASC",
}


@app.get("/api/listings")
def get_listings(
    beds:               list[int] | None = Query(None),
    min_price_per_bed:  int       | None = Query(None),   # floor; the buffer below never widens this end
    max_price_per_bed:  int       | None = Query(None),
    buffer_type:        str       | None = Query(None),   # "percent" | "fixed" | "exact"
    buffer_value:       float     | None = Query(None),
    availability_window: str      | None = Query(None),   # "now" | "june_2026" | ...
    company:            list[str] | None = Query(None),   # multi-select; omitted means every source
    property_type:      str       | None = Query(None),
    penthouse:          bool      | None = Query(None),
    page:               int       | None = Query(None, ge=1),
    page_size:          int       | None = Query(None, ge=1, le=100),
    sort:               str       | None = Query(None),
    _=Depends(verify_token),
):
    latest_txt = os.path.join(SNAPSHOTS_DIR, "latest.txt")
    if not os.path.exists(latest_txt):
        return {"listings": []}
    date_str = open(latest_txt).read().strip()
    db_path  = os.path.join(SNAPSHOTS_DIR, f"listings_{date_str}.db")
    if not os.path.exists(db_path):
        return {"listings": []}

    clauses: list[str] = []
    params:  list      = []

    if beds:
        exact_beds   = [b for b in beds if b < 5]
        has_five_plus = any(b >= 5 for b in beds)
        parts = []
        if exact_beds:
            placeholders = ",".join("?" * len(exact_beds))
            parts.append(f"beds IN ({placeholders})")
            params.extend(exact_beds)
        if has_five_plus:
            parts.append("beds >= 5")
        if parts:
            clauses.append(f"({' OR '.join(parts)})")

    # Price is a range as of 2026-07-20. The buffer stays a ceiling-only concept:
    # it widens how far ABOVE the stated max a listing may sit, and never moves
    # the floor, so "between $700 and $900, +15%" means 700 <= price <= 1035.
    if min_price_per_bed is not None:
        clauses.append("price_per_bed_low >= ?")
        params.append(int(min_price_per_bed))

    if max_price_per_bed is not None:
        # No buffer_type means the user never picked a tolerance, which reads as
        # "exact". It used to fall back to +15%, so an untouched control quietly
        # returned listings above the stated max.
        btype = buffer_type
        bval  = buffer_value
        if btype == "percent":
            ceiling = int(max_price_per_bed * (1 + (bval if bval is not None else 15) / 100))
        elif btype == "fixed":
            ceiling = int(max_price_per_bed + (bval or 0))
        else:
            ceiling = int(max_price_per_bed)
        clauses.append("price_per_bed_low <= ?")
        params.append(ceiling)

    # Month windows use '%Month%2026%' (not '%Month 2026%') so dated strings like
    # "Available August 14, 2026" and annotated ones like "Available August 2026
    # (1 of 12 units)" match too — several scrapers emit exact move-in dates.
    if availability_window == "now":
        clauses.append("(availability LIKE '%Available Now%' OR availability LIKE '%Immediate Move-In%')")
    elif availability_window == "june_2026":
        clauses.append("availability LIKE '%Available June%2026%'")
    elif availability_window == "july_2026":
        clauses.append("availability LIKE '%Available July%2026%'")
    elif availability_window == "august_2026":
        clauses.append("availability LIKE '%Available August%2026%'")
    elif availability_window == "leased":
        clauses.append("availability LIKE '%Leased%'")

    if company:
        placeholders = ",".join("?" * len(company))
        clauses.append(f"company IN ({placeholders})")
        params.extend(company)

    if property_type:
        clauses.append("property_type = ?")
        params.append(property_type)

    if penthouse:
        clauses.append("(unit_type LIKE '%enthouse%' OR tagline LIKE '%enthouse%')")

    sql = (
        "SELECT company, address, area, property_type, unit_type, beds, baths,"
        " price_per_bed_low, price_per_bed_high, price_total_low, price_total_high,"
        " price_note, availability, url, photo_url, availability_summary, tagline,"
        " description, amenities, lease_dates, utility_fees, brochure_url, lat, lng"
        " FROM listings"
    )
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    total = None
    if page_size is not None:
        count_sql = "SELECT COUNT(*) FROM listings"
        if clauses:
            count_sql += " WHERE " + " AND ".join(clauses)
        total = con.execute(count_sql, params).fetchone()[0]

    # Sort is chosen from a fixed map rather than interpolated, so the client can
    # never inject SQL through the `sort` param. Every option pushes NULLs last and
    # ends with a stable tiebreak, otherwise rows drift between pages.
    sql += " ORDER BY " + SORT_ORDERS.get(sort or "", SORT_ORDERS["beds"])
    query_params = list(params)
    if page_size is not None:
        sql += " LIMIT ? OFFSET ?"
        query_params += [page_size, ((page or 1) - 1) * page_size]

    rows = con.execute(sql, query_params).fetchall()
    con.close()

    def _to_listing(row: sqlite3.Row) -> dict:
        avail = row["availability"] or ""
        # Mirrors the archived Chroma ingest availability logic — substring match, not a
        # keyword list, so scraper-specific phrasings like MHM's "Available (LAST
        # UNIT)" or Smile's "Available now" all count.
        s = avail.lower()
        is_available = ("available" in s and "not available" not in s and "leased" not in s) \
            or "immediate move-in" in s or "move-in today" in s
        return {
            "company":              row["company"]              or "",
            "address":              row["address"]              or "",
            "unit_type":            row["unit_type"]            or "",
            "beds":                 row["beds"],
            "price_per_bed_low":    row["price_per_bed_low"],
            "price_per_bed_high":   row["price_per_bed_high"],
            "price_total_low":      row["price_total_low"],
            "price_total_high":     row["price_total_high"],
            "price_note":           row["price_note"]           or "",
            "availability":         avail,
            "is_available":         is_available,
            "area":                 row["area"]                 or "",
            "url":                  row["url"]                  or "",
            "lat":                  row["lat"],
            "lng":                  row["lng"],
            "photo_url":            row["photo_url"]            or "",
            "availability_summary": row["availability_summary"] or "",
            "tagline":              row["tagline"]              or "",
            "description":          row["description"]          or "",
            "amenities":            row["amenities"]            or "",
            "lease_dates":          row["lease_dates"]          or "",
            "utility_fees":         row["utility_fees"]         or "",
            "brochure_url":         row["brochure_url"]         or "",
            "property_type":        row["property_type"]        or "",
        }

    result: dict = {"listings": [_to_listing(r) for r in rows]}
    if total is not None:
        result["total"] = total
    return result
