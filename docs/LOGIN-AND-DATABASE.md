# Login and database

## "Invalid email or password" on this server

The database on this server was created fresh (migrations ran) and has **no users** in the `users` table. So login correctly returns "Invalid email or password" when the email is not found.

**Options:**

1. **Sign up** – On the website go to **Sign up**, create a new account with your email and a password. Then use **Sign in** with those credentials.
2. **Restore from old server** – If you have a PostgreSQL dump from the previous machine that includes the `users` table (and related tables: `oauth_accounts`, `webauthn_credentials`, `subscriptions`, etc.), restore it into this database so existing accounts work:
   - `psql -h localhost -U ihostmc -d ihostmc -f your_dump.sql`
   - Or use `pg_restore` if the dump is in custom format.
   - Then restart the backend: `sudo systemctl restart ihostmc-backend`.

## What is hooked up on this server

- **PostgreSQL** – Database `ihostmc`, user `ihostmc`; all migrations applied; `DATABASE_URL` in `backend/.env`.
- **Backend** – systemd `ihostmc-backend` on port 3010; proxied at `https://ihostmc-api.duckdns.org`.
- **Website** – systemd `ihostmc-website` on port 3020; proxied at `https://ihostmc.duckdns.org`.
- **Relay (Share server)** – PM2 `ihostmc-relay-frps` (port 7000) and `ihostmc-relay-port-api` (port 8081); `RELAY_PUBLIC_TOKEN` in backend `.env` so logged-in users get the token.
- **Deploy builder** – PM2 `iHostMC-builder` on port 9090; webhook/poll to pull, build, and restart services.

DuckDNS: `ihostmc.duckdns.org` (website), `ihostmc-api.duckdns.org` (API). Both point to this server; nginx + Let's Encrypt serve HTTPS.
