# Push to server + prompt for Cursor to continue

Use this after pushing the latest changes. It tells the server what to do and gives Cursor a prompt to **keep working on** the same goals (xAPI, admin dashboard, AI prompts, user API keys, etc.).

---

## 1. What was just pushed (summary)

- **App (desktop):** Homepage revamp (sleek dashboard, total storage, API & AI card, quick actions). Dev overrides: "Simulate storage almost full" and "Unlimited usage (dev)" in Settings → Developer.
- **Backend:** `XAI_API_KEY` in config (server-side only; set in `.env` on server). Admin area: same emails as `DEV_TIER_OVERRIDE_EMAIL` are admins. New routes: `GET /api/admin/me`, `GET /api/admin/usage/overview`, `POST /api/admin/usage/simulate-limit`. New table `admin_simulate_limit` (migration 015) to simulate "at limit" per user for testing.
- **Website:** Admin dashboard at `/dashboard/admin` (only visible when `GET /api/admin/me` returns admin). Shows total requests and per-user usage with "Simulate at limit" toggle.

---

## 2. What to do on the server after this push

**Copy-paste this into Cursor on the server** (or run the steps manually):

```text
Update the iHostMC server from the latest main:

1. In the repo root run: git pull origin main.

2. Backend:
   - cd backend. Run npm ci if package.json or lockfile changed.
   - Run npm run db:migrate so migration 015 (admin_simulate_limit) is applied.
   - Add to backend/.env if not set: XAI_API_KEY=<paste xAI key here; get from console.x.ai>. Never commit .env.
   - Ensure DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com (or your admin emails) so that account can use the Admin dashboard.
   - Restart the backend: sudo systemctl restart ihostmc-backend.

3. Website:
   - cd website. Run npm ci if deps changed, then npm run build. Restart the website (e.g. pm2 restart ihostmc-website or sudo systemctl restart ihostmc-website).

4. Verify:
   - GET /health returns ok.
   - Website loads; sign in with the override email and confirm "Admin" appears in the dashboard nav; open Admin and check usage overview and "Simulate at limit" toggle.
```

---

## 3. Prompt to give Cursor to keep working on this

**Paste the block below into Cursor (on the server or on your machine)** so it continues the same work:

```text
Continue the iHostMC work from the last push. Context:

- xAPI key is now on the server only (XAI_API_KEY in backend .env). Users never see it. We need to add backend endpoints that proxy AI requests to xAI using this key, track usage per user (existing usage_events / tier limits), and return results. Clients (app/website) call our API; we call xAI.

- Admin dashboard is done: /dashboard/admin for override emails, usage overview, and "Simulate at limit" per user. When simulate is on, that user gets 402 on usage recording until toggled off.

- Next goals (implement in order that makes sense):
  1. Backend: AI proxy endpoint(s) that accept prompts from authenticated users, call xAI with the server-held key, record usage (e.g. ai_* event type), enforce tier limits, return the response. Start with a single completion endpoint.
  2. User-facing API keys: allow users to create API keys on the website (or app), stored encrypted; keys are never shown again after creation but can be used to authenticate requests. Track usage per key; enforce limits by tier. Only the key owner sees usage for their keys.
  3. In-app AI: @server / @file style (like Cursor): user selects a server then can reference files (e.g. configs) to give context to the AI. Backend gathers content (config files, etc.), builds an efficient prompt (token-conscious), calls xAI, returns result. Optionally: different models, auto-setup servers from AI suggestions.
  4. Fancy loading screens and live conversation UI in the app; save conversations and history on the server; historize everything.
  5. Effective changes on servers from AI (e.g. "optimize this server"): apply edits to configs with a history so users can revert. Only touch config/supported files; show history of changes and allow revert.

- Dev override: when disabled, everything goes back to normal (no simulated limits, no dev-only toggles). Keep admin and simulate-limit behavior only for configured override emails and the admin dashboard.

Use the existing codebase: backend (Node/Express, Postgres, config.xaiApiKey), website (Next.js, dashboard, auth), app (Vite/React, home dashboard, settings). Follow the feature-folder structure and existing patterns. Run migrations when adding tables. Document new env vars in .env.example only (no secrets).
```

---

## 4. Related docs

- **PROMPT-SERVER-UPDATE.md** – Standard server update steps.
- **PROMPT-SERVER-AFTER-PUSH.md** – Short "after push" checklist.
- **CURSOR-SERVER-WORKFLOW.md** – Local ↔ server sync and deploy (51.38.40.106).
