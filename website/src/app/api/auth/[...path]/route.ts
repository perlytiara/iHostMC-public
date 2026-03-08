import { NextRequest, NextResponse } from "next/server";

function getBackendUrl(): string {
  const base =
    process.env.API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return base || "http://localhost:3010";
}

/** Proxy auth requests to the backend to avoid CORS. Used when NEXT_PUBLIC_USE_API_PROXY=true. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backend = getBackendUrl();
  const pathStr = path?.length ? path.join("/") : "";
  const url = `${backend}/api/auth/${pathStr}${request.nextUrl.search}`;
  try {
    const res = await fetch(url, { headers: request.headers });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      statusText: res.statusText,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backend = getBackendUrl();
  const pathStr = path?.length ? path.join("/") : "";
  const url = `${backend}/api/auth/${pathStr}`;
  try {
    const body = await request.text();
    const headers = new Headers(request.headers);
    headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body || undefined,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      statusText: res.statusText,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}
