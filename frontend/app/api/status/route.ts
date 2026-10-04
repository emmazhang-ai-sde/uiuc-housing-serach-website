import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
}

// Public endpoint — /api/status carries no user data and has no verify_token
// dependency on the backend, so unlike the other proxy routes this one does
// not check the Supabase session.
//
// It exists so the browser never needs to know the backend's port: the fetch
// happens server-side against BACKEND_URL, same as every other API route.
// Talking to the backend directly from the client meant this call was the one
// that broke whenever the local port changed or NEXT_PUBLIC_API_URL was unset.
export async function GET() {
  let res: Response
  try {
    res = await fetch(`${process.env.BACKEND_URL}/api/status`, { cache: "no-store" })
  } catch {
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502, headers: NO_STORE_HEADERS })
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ error: "Backend returned invalid response" }, { status: 502, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json(data, { status: res.status, headers: NO_STORE_HEADERS })
}
