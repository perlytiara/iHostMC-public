# Transfer iHostMC database from old server to this one (51.38.40.106)

Use this prompt on the **old server** (the machine that has the iHostMC database with users) to dump the database and send it to this server over SSH.

---

## Prompt to run on the OLD server

Copy and paste the block below into a terminal (or give it to an AI/operator) **on the old server** that has the iHostMC PostgreSQL database. Replace the placeholders if your database name or user are different.

```text
I need to dump the iHostMC PostgreSQL database from this machine and send it to the new server.

1. On this (old) server, dump the database to a file. Use the same database name and user as the iHostMC backend (often database and user are both "ihostmc"). If you use a different name, replace below.

   pg_dump -h localhost -U ihostmc -d ihostmc --no-owner --no-acl -Fc -f /tmp/ihostmc_dump.dump

   (If prompted for a password, use the PostgreSQL password for user ihostmc. If -Fc is not supported, use plain SQL: drop -Fc and use -f /tmp/ihostmc_dump.sql instead.)

2. Send the dump to the new server via SCP. The new server is 51.38.40.106, user ubuntu. Ensure SSH key or password auth works from this machine to ubuntu@51.38.40.106.

   scp /tmp/ihostmc_dump.dump ubuntu@51.38.40.106:/opt/iHostMC/

   (If you used .sql instead of .dump, send ihostmc_dump.sql.)

3. Optionally remove the local dump: rm -f /tmp/ihostmc_dump.dump

Tell me when the scp has finished so the new server can run the restore.
```

---

## After the dump arrives: restore on THIS server (51.38.40.106)

Run these commands **on this server** (where the repo is at `/opt/iHostMC`) after the file has been copied.

**If the file is custom format (`.dump`):**

```bash
cd /opt/iHostMC
# Use the password from backend/.env (DATABASE_URL). On this server you can run:
# export PGPASSWORD=$(grep DATABASE_URL backend/.env | sed -n 's/.*:\/\/ihostmc:\([^@]*\)@.*/\1/p')
PGPASSWORD=$(grep DATABASE_URL backend/.env | sed -n 's/.*:\/\/ihostmc:\([^@]*\)@.*/\1/p') pg_restore -h localhost -U ihostmc -d ihostmc --no-owner --no-acl --clean --if-exists ihostmc_dump.dump
sudo systemctl restart ihostmc-backend
```

**If the file is plain SQL (`.sql`):**

```bash
cd /opt/iHostMC
PGPASSWORD=$(grep DATABASE_URL backend/.env | sed -n 's/.*:\/\/ihostmc:\([^@]*\)@.*/\1/p') psql -h localhost -U ihostmc -d ihostmc -f ihostmc_dump.sql
sudo systemctl restart ihostmc-backend
```

Then remove the dump file if you like: `rm -f /opt/iHostMC/ihostmc_dump.dump /opt/iHostMC/ihostmc_dump.sql`

---

## One-liner from old server (dump and stream over SSH)

If the old server can SSH to 51.38.40.106 as `ubuntu` and you prefer not to write a file on the new server, you can pipe the dump over SSH. On the **old** server (replace SOURCE_DB_PASSWORD with the PostgreSQL password for user ihostmc on the old server):

```bash
# SOURCE_DB_PASSWORD = PostgreSQL password on the OLD server for user ihostmc
# On the new server, use the password from backend/.env (DATABASE_URL).
PGPASSWORD=SOURCE_DB_PASSWORD pg_dump -h localhost -U ihostmc -d ihostmc --no-owner --no-acl | ssh ubuntu@51.38.40.106 'PGPASSWORD=<from-new-server-backend-.env> psql -h localhost -U ihostmc -d ihostmc'
```

Then on the **new** server (51.38.40.106): `sudo systemctl restart ihostmc-backend`

Note: piping like this only works with plain SQL dump (no `-Fc`). The new server’s `psql` will apply the SQL; if the dump includes `DROP` or schema changes, that’s fine. If you have existing data on the new server you want to keep, use the file-based restore and resolve conflicts (e.g. `--clean --if-exists` with pg_restore, or edit the SQL).
