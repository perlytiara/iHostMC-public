# UI layout: current vs feature-ui-layout

## Current layout (main)

- **Window**: Single Tauri window, native OS title bar and decorations, 1280×800 (min 900×600), centered.
- **Top bar**: In-app header with logo, “iHostMC” | “iPlayMC” text switcher, version badge, design label, theme toggle. Optional strips for update-available and test mode.
- **Body (iHostMC)**:
  - **Left**: Fixed 256px sidebar — title “Servers”, icon row (Add, Import, Settings), “Run in background” checkbox, scrollable server list (name + play/stop + delete). Selecting a server shows the main area.
  - **Right**: One of Create wizard, Import, Settings, or (when a server is selected) **tab row** (Overview | Server | Mods & Plugins | Files) with a single content pane below.
- **Body (iPlayMC)**: One centered panel (launch/focus/test client + send chat).
- **Navigation**: Header toggles iHostMC vs iPlayMC. Inside iHostMC, sidebar selects server or switches to create/import/settings; main-area tabs switch between Overview, Server, Mods/Plugins, Files. No URL routing.

Overall: classic “sidebar + main with tabs” desktop layout and standard window chrome.

---

## New layout (feature-ui-layout)

- **Window**: Same size constraints; optionally **immersive** (custom-drawn app bar instead of relying only on native title bar), so the app feels like one continuous surface on Windows and other platforms.
- **App bar (single top bar)**:
  - **Left**: Logo + app name; then **menu bar** (File, Edit, View, Server, Help) with dropdown menus — proper desktop-style menus, not a typical Windows title bar.
  - **Right**: Theme toggle, version (or moved under Help). Update/test strips remain below the bar if needed.
  - The bar is the primary chrome; window controls (min/max/close) stay native where appropriate, or the bar can act as drag region for a custom title bar.
- **Menus**:
  - **File**: New server, Import server, Run in background (toggle), Exit (Tauri).
  - **Edit**: Preferences (opens Settings).
  - **View**: Theme (Light/Dark), Design (Simple/Standard, Monochrome/Colorful), Mode (iHostMC / iPlayMC).
  - **Server**: Contextual when a server is selected (Start, Stop, Open folder, etc.); otherwise disabled or “Select a server”.
  - **Help**: About, Version, Check for updates, Dev menu (shortcut hint).
- **Body (iHostMC)**:
  - **Left**: **Collapsible rail**: when expanded, same server list as before (with Add, Import, Settings, run-in-background); when **collapsed**, narrow icon-only strip (Servers, Add, Import, Settings) with server list in an overlay/slide-out or dropdown so the main content gains width.
  - **Right**: Unchanged conceptually (Create / Import / Settings / server tabs + content), but with more space when the rail is collapsed.
- **Body (iPlayMC)**: Unchanged; single centered panel.
- **Tabs**: Server detail tabs (Overview, Server, Mods & Plugins, Files) can be restyled (e.g. pill or underline) to match the new chrome.

Improvements: **Immersive** app bar with **proper menu bar** (File, Edit, View, Server, Help); **collapsible** server rail for a more flexible, content-first layout; same functionality, different placement and hierarchy so it doesn’t feel like the “typical Windows” layout.
