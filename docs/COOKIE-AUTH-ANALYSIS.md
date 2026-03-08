# Cookie / Auth Analysis for Login

This guide explains how to extract auth data (cookies, localStorage, JWT) so we can debug and improve the login flow.

## How to get auth data from the website

1. **Open the iHost website** (e.g. https://ihost.one) and sign in.

2. **Open DevTools** (F12 or right-click → Inspect).

3. **Option A: localStorage (primary auth method)**  
   - DevTools → **Application** (Chrome) or **Storage** (Firefox)  
   - Left sidebar → **Local Storage** → select `https://ihost.one` (or your domain)  
   - Find key `ihostmc-auth`  
   - Value is JSON: `{"user":{"token":"eyJ...","userId":"...","email":"..."}}`  
   - The `token` field is the JWT used for API calls.

4. **Option B: Copy token from Profile page**  
   - Dashboard → Profile  
   - Click **Copy token for app** (copies the JWT to clipboard).

5. **Option C: Cookies**  
   - DevTools → Application → Cookies → `https://ihost.one`  
   - The site uses JWT in localStorage for auth; cookies (e.g. admin-preview) are secondary.  
   - If you see cookies, copy their **Name** and **Value** (e.g. `admin-preview=...`).

## Sending for analysis

You can paste the auth data in chat (Cursor, GitHub issue, etc.) for analysis. Redact sensitive parts if needed.

- **Format 1 (recommended)**: Paste the value of `ihostmc-auth` from localStorage (you can redact the middle of the JWT and email if desired; we mainly need structure).
- **Format 2**: Paste cookies as `Name=Value` lines.
- **Context**: What failed? (e.g. "401 on /api/sync/servers", "login link doesn't work", "app shows signed in but all API calls fail")

## Testing on Windows

After pulling changes:

1. Build the app: `npm run build:public` (or `npm run build` if using local API).
2. Run: `npm run tauri dev` (or build and install the installer).
3. Settings → Account → Sign in with Browser (or expand "Paste token from browser" and paste if browser flow fails).
4. If you copied the token from the website Profile page, paste it in the paste-token field.
