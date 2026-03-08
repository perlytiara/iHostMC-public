# Fix ChunkLoadError on ihost.one (dashboard/backups etc.)

If the site shows "Application error" or "Loading chunk failed" (ChunkLoadError), the HTML is asking for JS/CSS chunks that don't exist (e.g. after a deploy, old cached HTML pointed at old chunk filenames).

## One-time fix on the server

Run from the repo root (e.g. `/opt/iHostMC`):

```bash
# 1. Clean build so chunk filenames match what the app will serve
cd website && rm -rf .next && npm run build && cd ..

# 2. Restart the website so it serves the new build
sudo systemctl restart ihostmc-website

# 3. Reload nginx so HTML isn't cached (if you updated deploy/nginx/ihost-one.conf)
sudo cp deploy/nginx/ihost-one.conf /etc/nginx/sites-available/ihost-one
sudo nginx -t && sudo systemctl reload nginx
```

Or use the refresh script (after pulling the latest code that includes the clean build):

```bash
./deploy/refresh-website.sh
```

Then reload nginx if the config changed.

## What was changed to prevent recurrence

- **Deploy builder** now removes `website/.next` before each website build so every deploy produces a consistent set of chunk files.
- **refresh-website.sh** runs `rm -rf .next` before `npm run build`.
- **Nginx** (deploy/nginx/ihost-one.conf) sets `Cache-Control: no-store` for `/` so HTML is not cached and always references current chunks; `/_next/static/` is cached long-term (immutable hashes).
- **Chunk path with brackets:** App route `[[...path]]` produces chunk URLs with percent-encoded brackets (`%5B%5B...path%5D%5D`). For `/_next/static/` we use `proxy_pass http://127.0.0.1:3020$request_uri` so the URI is passed as-is; some stacks return 400 when the path contains literal `[ ]`. Next.js decodes the path when serving files from `.next/static/chunks/app/[[...path]]/`.

After deploying these changes and running the one-time fix above, users should get fresh HTML and the correct chunks.
