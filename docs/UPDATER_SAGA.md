# Updater saga — seamless updates and backward compatibility

This document describes how iHostMC’s auto-updater works and how we keep **old app versions** able to receive updates without breaking.

## Design goals

- **One window, no immersion break:** When the user starts an update, the app switches to a single full-window “Updating…” view (download → install → restart). The window stays open until the installer runs; we don’t pop modals that make it feel like the app “closed.”
- **Discord-like behavior:** One idle window with clear progress. On Windows, the NSIS updater runs in **passive** mode (small progress bar, no user interaction). After install, the app relaunches automatically.
- **Debug for devs / private access:** If the dev menu is enabled or the override key is set (`localStorage["ihostmc-updater-debug"] = "true"`), the update screen shows extra debug info (phase, version, download bytes).
- **AV-friendly:** Updates are **signed**. The updater uses the same Tauri signed-artifact flow; we don’t do anything that would trigger AV beyond normal installer behavior.

## How updates work

1. **Check:** On startup (and when the user clicks “Check for updates”), the app requests the update manifest from the configured endpoint (e.g. `latest.json` on GitHub Releases).
2. **Download:** If a newer version is available, the user can choose “Update now.” The app downloads the signed installer in the background and shows a full-window progress view.
3. **Install:** When the download finishes, the app shows “Installing…” and runs the installer. On Windows, the app exits and the NSIS installer runs in **passive** mode (progress bar only). On macOS/Linux, behavior is platform-appropriate.
4. **Restart:** After install, the new version is launched (by the installer or by our relaunch call where applicable).

Install location is chosen at **first install** (or by the user during that install). It can be changed by reinstalling the app; we do not currently expose an in-app “change install path” setting.

## Backward compatibility — old versions still get updates

We keep the following **stable** so that older app versions (e.g. 0.1.0, 0.1.1) continue to receive updates:

- **Endpoint URL:** The app is configured with a single endpoint (e.g. `https://github.com/perlytiara/iHostMC/releases/latest/download/latest.json`). We do not change this URL in released builds.
- **Manifest format:** The `latest.json` (or dynamic response) must stay compatible with the Tauri updater plugin:
  - Required: `version` (SemVer), `platforms` (or per-arch `url`/`signature`), and `signature` for the platform being updated.
  - Optional: `notes`, `pub_date`. See [Tauri updater docs](https://v2.tauri.app/plugin/updater/) for the exact static and dynamic formats.
- **Signing:** We keep using the same **public key** in `tauri.conf.json` and the same **private key** for signing release artifacts. Rotating keys would prevent old clients from verifying new updates.
- **No mandatory “min updater version”:** We don’t require users to go to the website to get a new installer before they can receive in-app updates. Any version that can fetch the manifest and verify the signature can update.

So: **old versions of the software can keep handling updates** as long as we don’t change the endpoint, the manifest shape, or the signing key. New features (e.g. full-window update UI, passive install) are in newer builds; old builds still get the same update payload and can install it with their (possibly simpler) UI.

## Configuration (for maintainers)

- **Windows install mode:** In `tauri.conf.json`, `plugins.updater.windows.installMode` is set to `"passive"` so the update installer shows a progress bar without requiring user interaction.
- **Capabilities:** The default capability set allows `updater:allow-check`, `updater:allow-download`, `updater:allow-install`, and `updater:allow-download-and-install`.
- **Debug override:** Set `localStorage["ihostmc-updater-debug"] = "true"` (or enable the dev menu) to see debug details on the update screen.

## Summary

- One full-window update view; no immersion-breaking modal flow.
- Windows: passive NSIS install; then app relaunches.
- Debug info available with dev menu or override key.
- Install path is fixed at first install; change via reinstall.
- **Stable endpoint, manifest format, and signing** so old app versions continue to receive and install updates.
