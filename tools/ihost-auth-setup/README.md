# ihost auth-setup

> **WIP** — Sign-in options setup is work in progress. For a checklist of all platforms and steps, see [TODO: Sign-in setup](../../docs/PROMPT-WINDOWS-GIT-PULL-AND-AUTH-SETUP.md#todo-sign-in-setup-pick-up-later) in the Windows prompt doc.

Step-by-step helper to set up OAuth sign-in (Google, GitHub, Discord, Microsoft) for your org. It walks you through one provider at a time: open the page, set the callback URL, paste Client ID and Secret. Progress is saved so you can do one and stop; run again later to add more. At the end you can write the keys straight into `backend/.env`.

## Run

From repo root:

```bash
npm run auth-setup
```

or:

```bash
node tools/ihost-auth-setup/index.cjs
```

- **First run:** You’ll see progress 0/4. For each provider you can choose “Set up X now? (y/n/skip)”. If you say **y**, you get literal steps: open this URL → press Enter → set this callback URL → press Enter → paste Client ID → paste Client Secret.
- **Later runs:** Progress shows “Done: GitHub. Left: Google, Discord, Microsoft.” You can add one more, skip the rest, and quit. Progress is saved.
- **When done (or after any run):** The script can append the OAuth block to `backend/.env` for you (default: yes). It replaces any previous “OAuth – added by tools/ihost-auth-setup” block so you don’t get duplicates. Then restart the backend.

You will be asked for:

1. **Backend public URL** (e.g. `https://api.ihost.one`) – used for all callback URLs.
2. For each provider you choose:
   - The script shows **where** to create the app and the **exact callback URL** to use.
   - You create the app on that site, then answer **y** when asked "Created?"
   - Paste **Client ID** and **Client Secret** when prompted (and for Microsoft, tenant if needed).

Progress is saved in `.auth-setup-progress.json`. When finished, the script prints (or writes) the env block to add to `backend/.env`. Restart the backend after adding the keys.

## Callback URLs (reference)

- Google: `{BACKEND_PUBLIC_URL}/api/auth/google/callback`
- GitHub: `{BACKEND_PUBLIC_URL}/api/auth/github/callback`
- Discord: `{BACKEND_PUBLIC_URL}/api/auth/discord/callback`
- Microsoft: `{BACKEND_PUBLIC_URL}/api/auth/microsoft/callback`

Use the same URL in your provider’s “Authorized redirect URI” / “Callback URL” / “Redirects” field.
