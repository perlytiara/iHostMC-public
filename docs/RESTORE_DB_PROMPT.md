# Restore iHostMC database on the new server

Use this after the project is on the server (e.g. after `git pull` or transfer) and PostgreSQL is installed. The dump file is at `/opt/iHostMC/ihostmc_dump.dump` (custom format) or `ihostmc_dump.sql` (if plain SQL was used instead).

---

## Copy-paste prompt (give this to an AI or run manually)

```
On the new server (Ubuntu, user ubuntu), restore the iHostMC PostgreSQL dump.

- Dump file location: /opt/iHostMC/ihostmc_dump.dump (custom format from pg_dump -Fc). If the file is ihostmc_dump.sql instead, use the SQL restore steps below.
- PostgreSQL must be installed. Create the database and user if they don't exist (same as backend .env expects):
  - Database name: ihostmc
  - User: ihostmc (with a password you set; update backend/.env DATABASE_URL to match)

Steps:

1. Create user and database (if not already present):
   sudo -u postgres psql -c "CREATE USER ihostmc WITH PASSWORD 'YOUR_PASSWORD';" -c "CREATE DATABASE ihostmc OWNER ihostmc;" 2>/dev/null || true
   (If they already exist, skip or adjust.)

2. Restore from custom-format dump:
   sudo -u postgres pg_restore -h localhost -U ihostmc -d ihostmc --no-owner --no-acl -Fc /opt/iHostMC/ihostmc_dump.dump
   (If prompted for password, use the ihostmc user's password.)

   If the file is plain SQL (ihostmc_dump.sql) instead:
   sudo -u postgres psql -U ihostmc -d ihostmc -f /opt/iHostMC/ihostmc_dump.sql

3. Ensure backend/.env on the server has DATABASE_URL=postgresql://ihostmc:YOUR_PASSWORD@localhost:5432/ihostmc (same user/password as above).

4. Run migrations so schema is up to date: cd /opt/iHostMC/backend && npm run db:migrate

5. Optionally remove the dump file after successful restore: rm -f /opt/iHostMC/ihostmc_dump.dump
```

---

## Quick commands (manual run)

```bash
# 1. Create DB/user (set YOUR_PASSWORD; skip if already done)
sudo -u postgres psql -c "CREATE USER ihostmc WITH PASSWORD 'YOUR_PASSWORD';" -c "CREATE DATABASE ihostmc OWNER ihostmc;"

# 2. Restore (custom format)
sudo -u postgres pg_restore -h localhost -U ihostmc -d ihostmc --no-owner --no-acl -Fc /opt/iHostMC/ihostmc_dump.dump

# 3. Sync backend .env DATABASE_URL with the password you used

# 4. Migrations
cd /opt/iHostMC/backend && npm run db:migrate
```
