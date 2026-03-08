# OAuth login (Google, GitHub, Discord, Microsoft)

**Status: Not configured yet.** Login/signup with Google, GitHub, Discord, and Microsoft is implemented in code but **will not work until you add credentials** in the backend `.env`. The buttons will only appear once at least one provider has a Client ID set. Use this doc when you're ready to hook it up.

---

## 1. Backend env

In `backend/.env` set the public URL of your API (used as redirect base for all providers):

```env
BACKEND_PUBLIC_URL=https://api.ihostmc.com
# or local: BACKEND_PUBLIC_URL=http://localhost:3010
WEBSITE_URL=https://ihost.one
```

Then add Client ID + Secret for each provider you want (leave blank to hide that provider):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
```

Restart the backend after changing `.env`. Ensure `CORS_ORIGINS` includes your website origin.

---

## 2. Google

- **Console:** <https://console.cloud.google.com/>
- **Credentials (create OAuth client):** <https://console.cloud.google.com/apis/credentials>  
  → Create credentials → OAuth client ID → Web application
- **OAuth consent screen (if needed):** <https://console.cloud.google.com/apis/credentials/consent>

**Authorized redirect URI to add:**  
`https://YOUR_BACKEND_HOST/api/auth/google/callback`  
(e.g. `https://api.ihostmc.com/api/auth/google/callback` or `http://localhost:3010/api/auth/google/callback`)

Copy Client ID and Client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 3. GitHub

- **Developer settings → OAuth Apps:** <https://github.com/settings/developers>  
  → OAuth Apps → New OAuth App
- **New OAuth App (direct):** <https://github.com/settings/applications/new>

**Authorization callback URL:**  
`https://YOUR_BACKEND_HOST/api/auth/github/callback`

Copy Client ID and generate Client secret → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

---

## 4. Discord

- **Applications:** <https://discord.com/developers/applications>  
  → Your app (or create one) → left sidebar **OAuth2**

**Redirects → Add redirect:**  
`https://YOUR_BACKEND_HOST/api/auth/discord/callback`

Copy Client ID and Client secret from OAuth2 → `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

---

## 5. Microsoft (Azure)

- **App registrations:** <https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade>  
  → New registration
- **Entra (alternative):** <https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade>

**Authentication** → Add platform → Web → Redirect URI:  
`https://YOUR_BACKEND_HOST/api/auth/microsoft/callback`

**API permissions** → Add → Microsoft Graph → Delegated → `openid`, `profile`, `email`.

**Certificates & secrets** → New client secret → copy value.

Copy Application (client) ID and secret → `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`. Optionally `MICROSOFT_TENANT_ID=common` for personal + work accounts.

---

## 6. Quick reference (URLs only)

| Provider   | Where to go |
|-----------|------------------------------------------|
| **Google**   | <https://console.cloud.google.com/apis/credentials> |
| **GitHub**   | <https://github.com/settings/developers> |
| **Discord**  | <https://discord.com/developers/applications> |
| **Microsoft**| <https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade> |

Replace `YOUR_BACKEND_HOST` everywhere with your real backend host (e.g. `api.ihostmc.com` or `localhost:3010`).

---

## 7. After configuring

Restart the backend. Open the website login/signup page; only providers with a Client ID set will show a “Continue with …” button. Clicking one sends you to the provider, then back to `/login/callback` with a token; the site stores it and redirects to dashboard (or app-connect flow if `session` is in the URL).
