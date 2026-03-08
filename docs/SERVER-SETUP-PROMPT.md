# Server setup prompt (Linux)

Paste this into Cursor **on the server** (Linux) to pull the latest website and redeploy:

```
I'm on the Linux server. Update the iHostMC website to the latest code. Do: (1) cd to the iHostMC repo and run git pull origin main. (2) In website/.env set NEXT_PUBLIC_API_URL to the backend (e.g. http://YOUR_SERVER_IP:3010) and optionally NEXT_PUBLIC_DOWNLOAD_URL. (3) In website/ run npm install and npm run build. (4) Restart the website service (e.g. systemctl restart ihostmc-website or deploy/run-all.sh). The app uses the website URL for "Sign in on website" (e.g. http://YOUR_SERVER_IP:3020/login?return=app). Login handoff works for both dev and production: after sign-in the site sends auth to the user's app via localhost:1421 (app must be running). Tell me when the site is live.
```

---

# Bounce back to Windows

After the server is updated, paste this into Cursor **on Windows** to verify or fix the desktop app side:

```
I'm on Windows. The iHostMC server is ready (website at http://YOUR_SERVER_IP:3020, API at http://YOUR_SERVER_IP:3010). Get this machine ready to build and test the app: (1) git pull origin main. (2) Copy .env.example to .env if needed and set VITE_API_BASE_URL=http://YOUR_SERVER_IP:3010 so the app talks to the server. (3) npm install then npm run tauri dev to run in dev, or npm run tauri build for the installer. Test: "Sign in with browser" in the app (opens login with session; after login the site sends auth to localhost:1421). Also test dashboard "Open in iHostMC" with the app running. Tell me when the build works and what to test next.
```
