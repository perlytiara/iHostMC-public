# Cursor server debug handoff

Use this so the **server-side** Cursor (or you on the server) can gather logs and produce a **return prompt** for the **client-side** Cursor to fix the bug.

---

## Prompt to give to Cursor on the server (or run manually)

Copy the block below and paste it into Cursor (or run the commands) **on the Linux server** (51.75.53.62 or SSH session).

```text
Context: The iHostMC website at http://51.75.53.62:3020 calls the backend at http://51.75.53.62:3010. Signup (POST /api/auth/register) is returning 500 Internal Server Error. The frontend is correct; the failure is in the backend.

Do the following on this server:

1. Get the last 80–100 lines of backend logs (choose one that applies):
   - If backend runs under systemd: `sudo journalctl -u ihostmc-backend -n 100 --no-pager`
   - If backend runs under PM2: `pm2 logs ihostmc-backend --lines 100 --nostream`
   - If you use another process manager, run the equivalent to see recent backend stdout/stderr.

2. From the logs, find the error/stack trace that corresponds to the 500 on POST /api/auth/register (look for "register", "500", or the timestamp when signup was attempted).

3. Check that the backend .env (or environment) has the required variables for auth/DB (e.g. DATABASE_URL, JWT_SECRET, PORT=3010). Do not paste secret values; only say whether each required key is set or missing.

4. Produce a "return prompt" (see format below) and paste it back so the client-side Cursor can fix the code or config.
```

---

## Return prompt format (server → client)

After you run the steps above on the server, fill in the template below and **paste it into the Cursor chat on Windows** (the one that has the repo and can edit code). That will give the client-side Cursor enough context to debug and fix the issue.

```text
--- SERVER DEBUG RETURN (paste this into Cursor on Windows) ---

**Backend 500 on POST /api/auth/register**

- **How backend is run:** [ systemd / PM2 / other ]
- **Relevant log excerpt (last 500 chars or so around the error; redact secrets):**
[ Paste the error line(s) and stack trace here ]

- **Env check (required for auth/DB):** [ e.g. DATABASE_URL=set, JWT_SECRET=set, PORT=3010; or list any missing ]

- **Exact error message or exception name from logs:** [ e.g. "ECONNREFUSED", "relation \"users\" does not exist", "JWT_SECRET is undefined" ]

--- END RETURN ---
```

---

## Quick commands (run on server)

```bash
# Backend logs (systemd)
sudo journalctl -u ihostmc-backend -n 100 --no-pager

# Backend logs (PM2)
pm2 logs ihostmc-backend --lines 100 --nostream

# Backend .env present and has required keys? (do not paste contents)
grep -E '^[A-Z_]+=.' /opt/iHostMC/backend/.env 2>/dev/null | sed 's/=.*/=***/' || echo "No .env or not readable"
```
