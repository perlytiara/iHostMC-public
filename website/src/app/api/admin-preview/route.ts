import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_PREVIEW_COOKIE = "ihostmc-admin-preview";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
/** Cookie value "admin" = admin user (full site + show dev toggle). "1" = any logged-in user (full site when under construction, e.g. app login). */
const COOKIE_VAL_ADMIN = "admin";
const COOKIE_VAL_LOGGED_IN = "1";

function getApiBaseUrl(): string {
  const base =
    process.env.API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return base || "http://localhost:3010";
}

/** GET: return whether the current request has admin-preview (so Header can show dev toggle only to admins). */
export async function GET() {
  const cookieStore = await cookies();
  const val = cookieStore.get(ADMIN_PREVIEW_COOKIE)?.value ?? "";
  const admin = val === COOKIE_VAL_ADMIN;
  return NextResponse.json({ admin });
}

/** DELETE: clear admin-preview cookie (e.g. on logout). */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_PREVIEW_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

/** POST: set full-site cookie when under construction. Any valid user gets "1" (full site); admins get "admin" (full site + dev toggle). Enables app login and logged-in users to see the real site. */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getApiBaseUrl();
  try {
    const authMeRes = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!authMeRes.ok) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    let cookieValue = COOKIE_VAL_LOGGED_IN;
    const adminMeRes = await fetch(`${base}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (adminMeRes.ok) cookieValue = COOKIE_VAL_ADMIN;

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_PREVIEW_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
