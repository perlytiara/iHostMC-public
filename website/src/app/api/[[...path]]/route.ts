import { NextRequest, NextResponse } from "next/server";

function getBackendUrl(): string {
  const base =
    process.env.API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return base || "http://localhost:3010";
}

/** Proxy non-auth API requests to the backend (dashboard, backups, subscription, sync, etc.). Used when NEXT_PUBLIC_USE_API_PROXY=true. */
async function proxy(
  request: NextRequest,
  path: string[] | undefined,
  method: string
): Promise<NextResponse> {
  if (!path?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const backend = getBackendUrl();
  const pathStr = path.join("/");
  const url = `${backend}/api/${pathStr}${request.nextUrl.search}`;
  try {
    const headers = new Headers(request.headers);
    const body = method !== "GET" && method !== "HEAD" ? await request.text() : undefined;
    if (body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, {
      method,
      headers,
      body,
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? [], "GET");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? [], "POST");
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? [], "PUT");
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? [], "PATCH");
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return proxy(request, path ?? [], "DELETE");
}
