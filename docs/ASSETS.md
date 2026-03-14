# iHostMC & iHost — Asset catalog

All generated and static assets, where they live, and where they’re used. Style: **dark theme, violet/purple primary** (iHost brand).

---

## App assets (in-app UI)

**Location:** `public/assets/`  
**URL in app:** `/assets/<filename>` (Vite serves `public/` at root)

| File | Purpose | Used in |
|------|---------|--------|
| `app-splash.png` | Splash / loading screen | Optional splash screen, about panel |
| `app-onboarding-welcome.png` | First-time welcome | Onboarding overlay, step 0 |
| `app-empty-servers.png` | No servers yet | Server list empty state |
| `app-about-badge.png` | About / app identity | Settings → About |
| `app-share-success.png` | Share-with-friends moment | Share server flow, tooltips |

**Design:** Dark blue-grey background, violet (#7c6bff–#5344dd) accent, white/light grey text. Match `AppLogo` and `HomeHeroIllustration` (SVG) for consistency.

---

## README / docs images

**Location:** `docs/images/`  
**Used in:** README.md (this repo and iHost main repo), linked via `docs/images/<filename>`.

| File | Purpose |
|------|--------|
| `ihost-hero-banner.png` | Hero at top of README |
| `ihost-create-share-play.png` | Create → Share → Play flow |
| `ihost-app-window-mockup.png` | App window mockup |
| `ihost-relay-no-port-forward.png` | Relay / no port forwarding diagram |
| `ihost-share-one-link.png` | One link, no router config |
| `ihost-minecraft-badge.png` | Minecraft + iHost badge (section/icon) |

---

## Icon set (Tauri / bundle)

**Location:** `src-tauri/icons/`  
**Used for:** App icon, installer, taskbar, dock.  
**Formats:** icon.ico, icon.png, icon.icns, and platform-specific sizes (see `icons/README.md`).

---

## Inline / code assets

- **AppLogo** (`src/components/AppLogo.tsx`) — SVG “iH” block, used in title bar, tray, onboarding, about.
- **HomeHeroIllustration** (`src/components/HomeHeroIllustration.tsx`) — SVG server block(s), used on home (signed-out and signed-in hero).

---

## Adding or changing assets

1. **App UI images:** Add PNG/WebP to `public/assets/`, reference as `/assets/filename.ext`.
2. **README images:** Add to `docs/images/`, reference in README as `docs/images/filename.png`. Copy same files into iHost repo `docs/images/` if the main README should show them.
3. **Icons:** Replace or add in `src-tauri/icons/` and run Tauri icon pipeline if needed.
4. **Inline SVGs:** Edit the component (AppLogo, HomeHeroIllustration) to keep a single source of truth.

Keep this file in sync when you add or remove assets.
