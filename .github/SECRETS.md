# Config: Variables and Secrets for GitHub Actions

## Quick setup (automatic)

```bash
# Requires: gh CLI (https://cli.github.com/), run `gh auth login` first
node scripts/setup-github-actions.cjs           # set Variables (VITE_API_BASE_URL, VITE_WEBSITE_URL)
node scripts/setup-github-actions.cjs --secrets # also set Secrets from .env.gh-secrets
```

## Variables (public – not secret)

These are baked into the app build. Set via **Repository Variables** (Settings → Secrets and variables → Actions → Variables).

| Variable | Value | Purpose |
| -------- | ----- | ------- |
| `VITE_API_BASE_URL` | `https://api.ihost.one` | Backend API (auth, billing, relay token). |
| `VITE_WEBSITE_URL` | `https://ihost.one` | Website for sign-in, dashboard. |

## Secrets (never in frontend)

| Secret | Purpose |
| ------ | ------- |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing – required for in-app updates. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key (if set). |

**To add secrets:**
1. Copy `.env.gh-secrets.example` to `.env.gh-secrets`
2. Fill `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. Run `gh secret set -f .env.gh-secrets`
4. Delete `.env.gh-secrets`

Or run `node scripts/setup-github-actions.cjs --secrets` after filling `.env.gh-secrets`.

## Local development

- **Variables:** Copy `.env.public.example` to `.env` (or rely on `ensure-env` and `.env.development`).
- **Secrets:** Never needed locally; signing is only for CI release builds.
