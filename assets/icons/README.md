# iHostMC app icons

- **Source:** `ihost-logo.svg` — iHost logo (server block with "iH" mark). Used for app icon, taskbar, tray, window, installer, and favicon.
- **Generated icons** are in `src-tauri/icons/` and are produced by:

  ```bash
  npx tauri icon assets/icons/ihost-logo.svg
  ```

  Do not run `node scripts/gen-icon.cjs`; it would overwrite the Windows icon with a placeholder.
  After generating, copy to web if needed: `icon.ico` → `public/favicon.ico`, `32x32.png` → `public/favicon.png`.
