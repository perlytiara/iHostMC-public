# Backend Troubleshoot & Security – Quick Guide for a Friend

Use this to run the iHostMC backend locally, try endpoints, and prompt Cursor to improve security.

## 1. Run the backend locally

```bash
cd /opt/iHostMC/backend
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET (min 32 chars). See .env.example comments.
npm install
npm run db:migrate   # if you have DB
npm run dev          # or: node dist/index.js after npm run build
```

Base URL: `http://localhost:3010` (or whatever `PORT` is in `.env`). Health check:

```bash
curl -s http://localhost:3010/health
# Expect: {"ok":true,"stripe":...,"syncAvailable":...}
```

## 2. API base paths and auth

| Base path | Auth required | Notes |
|-----------|----------------|--------|
| `/api/auth` | Mixed | Register, login, OAuth, `/me`, password reset, app-session, WebAuthn |
| `/api/keys` | Yes | API keys (e.g. CurseForge) – CRUD by key name |
| `/api/usage` | Yes | Usage tracking (POST, GET summary) |
| `/api/stripe` | Yes (except webhook) | Checkout, portal; webhook is raw body + Stripe signature |
| `/api/relay` | Yes | Relay token, CurseForge key |
| `/api/backups` | Yes | Backup upload/list/download/restore/trash |
| `/api/sync` | Yes | Servers, files, backups, manifest, trigger-sync, etc. |
| `/api/subscription` | Yes | Subscription status |
| `/api/tiers` | No | Public tier list (pricing page) |
| `/api/dev` | Yes (+ optional secret) | Dev tier override, Stripe test mode – **lock down in prod** |

Auth: **Bearer JWT**. Get a token via:

- `POST /api/auth/login` with `{ "email", "password" }`, or
- `POST /api/auth/register` then login, or
- OAuth: e.g. `GET /api/auth/google` (redirects), then use token from callback/session.

Use in requests:

```bash
export TOKEN="<your-jwt>"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/auth/me
```

## 3. Endpoints to try quickly (with `$TOKEN` set)

```bash
# Public
curl -s http://localhost:3010/health
curl -s http://localhost:3010/api/tiers

# Auth required
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/auth/me
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/backups
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/backups/limits
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/sync/servers
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/subscription/status
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/relay/token
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/keys/curseforge

# Dev (only if ALLOW_DEV_TIER_OVERRIDE=true and optional DEV_TIER_OVERRIDE_EMAIL)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/dev/can-use-override
# Set tier (needs X-Dev-Tier-Secret header):
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "X-Dev-Tier-Secret: YOUR_DEV_SECRET" \
  -d '{"tierId":"backup"}' http://localhost:3010/api/dev/set-tier
```

Try **without** token to confirm 401:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer bad" http://localhost:3010/api/backups
# Expect 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/api/backups
# Expect 401
```

## 4. Security areas to check and prompt for

When you find something, you can paste one of the prompts below into Cursor (in this repo) so the AI can help remediate.

- **Dev routes in production**  
  - Ensure `/api/dev/*` is disabled or strictly gated when not in development (e.g. `ALLOW_DEV_TIER_OVERRIDE=false`, or restrict by env/role).

- **CORS**  
  - Backend uses `CORS_ORIGINS` from `.env`. Verify no `*` in production and only trusted origins are listed.

- **Rate limiting**  
  - Check if login, register, password reset, and backup upload have rate limits. If not, ask to add them.

- **Input validation**  
  - Key routes: auth (register/login, reset password), backups (upload, IDs), sync (serverId, fileId, body params). Ask for validation/sanitization and safe error messages.

- **Stripe webhook**  
  - `/api/stripe/webhook` must verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`; do not trust body without verification.

- **Secrets and env**  
  - No `JWT_SECRET`, `ENCRYPTION_KEY`, `DEV_TIER_OVERRIDE_SECRET`, or Stripe keys in code or logs. Use `.env` and never commit `.env`.

- **IDs and authorization**  
  - Sync routes use `serverId`/`fileId`; backups use `id`. Ensure every operation checks that the resource belongs to the authenticated user (no IDOR).

## 5. Copy-paste prompts for Cursor

Give Cursor (or any AI in this repo) one of these to get concrete changes:

- **“Review backend security: add rate limiting for auth and backup endpoints, and ensure /api/dev is disabled when ALLOW_DEV_TIER_OVERRIDE is not true in production.”**

- **“Audit backend for IDOR: ensure every /api/sync and /api/backups route that takes an id or serverId checks the resource belongs to the authenticated user (req.userId).”**

- **“Add request validation and safe error responses for POST /api/auth/register and POST /api/auth/login (e.g. body shape, email format, password strength); avoid leaking whether an email exists.”**

- **“Check CORS and Stripe webhook: confirm CORS_ORIGINS is not * in production and that /api/stripe/webhook verifies Stripe-Signature with STRIPE_WEBHOOK_SECRET before processing.”**

- **“List all backend API routes with method and path, and mark which require auth; then suggest the three highest-impact security improvements.”**

## 6. Repo layout (backend)

- `backend/src/index.ts` – app entry, CORS, route mounting.
- `backend/src/middleware/auth.ts` – JWT Bearer auth.
- `backend/src/routes/` – auth, keys, usage, stripe, relay, backups, sync, subscription, tiers, dev.
- `backend/.env.example` – all env vars and comments.

Share this doc with your friend so they can run the backend, try different endpoints, and use the prompts above to drive security fixes.
