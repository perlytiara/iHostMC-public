# Windows-Code-Signatur (SmartScreen / „Bösartige Binärreputation“)

Windows kann Programme blockieren mit der Meldung **„Eine Anwendungssteuerungsrichtlinie hat diese Datei blockiert. Bösartige Binärreputation. (os error 4556)“**. Betroffen können sein: die App selbst (`npm run tauri dev` oder die gebaute .exe) oder heruntergeladene Tools (z. B. frpc beim **Server teilen**).

## Sofort-Lösung (ohne Signatur): Ausschlüsse

Damit die blockierte Datei trotzdem startet:

### App startet nicht (tauri dev oder .exe)

- **Projekt- bzw. Build-Ordner als Ausschluss:** Windows-Sicherheit → Viren- & Bedrohungsschutz → Einstellungen → Ausschlüsse → Ordner hinzufügen: z. B. dein iHostMC-Projektordner oder `src-tauri\target` (damit die Debug-/Release-.exe nicht blockiert wird).
- **Smart App Control** (Windows 11): Einstellungen → Datenschutz & Sicherheit → Windows-Sicherheit → App- & Browsersteuerung → bei Bedarf auf „Warnung“ stellen oder die blockierte App zulassen.
- **Datei entsperren:** Wenn die .exe aus dem Netz stammt: Rechtsklick auf die .exe → Eigenschaften → unten „Zulassen“ / „Unblock“ setzen.

### Fehler beim „Server teilen“ (Relay / frpc)

Beim Klick auf **Server teilen** lädt die App das Tool **frpc** in `%LOCALAPPDATA%\ihostmc\frp\` herunter. Windows kann diese .exe blockieren (Fehler 4556).

- **Ausschluss hinzufügen:** Windows-Sicherheit → Ausschlüsse → Ordner: `%LOCALAPPDATA%\ihostmc` (z. B. `C:\Users\<DeinName>\AppData\Local\ihostmc`).
- Oder: In diesen Ordner wechseln, Rechtsklick auf `frpc.exe` → Eigenschaften → „Zulassen“ / „Unblock“.

Danach **Server teilen** erneut ausführen.

---

Damit die gebaute `.exe` dauerhaft vertrauenswürdig ist, solltest du sie mit einem **Code-Signing-Zertifikat** signieren (kein SSL-Zertifikat).

## Zertifikat besorgen

- **OV (Organization Validated):** Günstiger, auch für Einzelpersonen; SmartScreen zeigt anfangs ggf. noch Warnung, Reputation baut sich auf.
- **EV (Extended Validation):** Teurer (ca. 400 €+), Hardware-Token nötig; SmartScreen vertraut sofort.

Anbieter z. B. in [Microsofts Liste](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-cert-manage) oder Sectigo, DigiCert, SSL.com, etc.

## Ablauf

### 1. Zertifikat in .pfx umwandeln

Du brauchst:

- Zertifikatsdatei (z. B. `cert.cer`)
- Private Key (z. B. `private-key.key`)

```bash
openssl pkcs12 -export -in cert.cer -inkey private-key.key -out certificate.pfx
```

Export-Passwort setzen und **sicher aufbewahren**.

### 2. .pfx in Windows importieren

PowerShell (Passwort anpassen):

```powershell
$WINDOWS_PFX_PASSWORD = 'DEIN_EXPORT_PASSWORT'
Import-PfxCertificate -FilePath certificate.pfx -CertStoreLocation Cert:\CurrentUser\My -Password (ConvertTo-SecureString -String $WINDOWS_PFX_PASSWORD -Force -AsPlainText)
```

### 3. Thumbprint und Algorithmus ermitteln

1. `Win + R` → `certmgr.msc` → Enter
2. **Eigene Zertifikate** → **Zertifikate**
3. Dein Code-Signing-Zertifikat doppelklicken → **Details**
4. **Signaturhashalgorithmus** → z. B. `sha256` (= `digestAlgorithm`)
5. **Fingerabdruck** → Wert kopieren (z. B. `A1B2C3D4...`) (= `certificateThumbprint`)

**Timestamp-URL:** Ein Zeitstempel-Server, z. B.:

- `http://timestamp.digicert.com`
- `http://timestamp.comodoca.com`

(Dein Zertifikatsanbieter nennt oft eine eigene URL.)

### 4. Tauri-Konfiguration

In `src-tauri/tauri.conf.json` im Abschnitt `bundle` den `windows`-Block erweitern (bzw. ersetzen):

```json
"windows": {
  "nsis": null,
  "wix": null,
  "certificateThumbprint": "DEIN_THUMBPRINT_OHNE_LEERZEICHEN",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

- `certificateThumbprint`: der Fingerabdruck aus certmgr (ohne Leerzeichen)
- `digestAlgorithm`: i. d. R. `sha256`
- `timestampUrl`: Zeitstempel-Server deines Anbieters

### 5. Build

```bash
npm run build
npm run tauri build
```

In der Build-Ausgabe solltest du etwas wie „Successfully signed: …“ sehen. Die gebaute `.exe` ist dann signiert und wird von Windows/SmartScreen eher akzeptiert.

## CI (z. B. GitHub Actions)

Für automatisches Signieren in GitHub Actions:

- Secret `WINDOWS_CERTIFICATE`: Base64 des `.pfx` (z. B. `certutil -encode certificate.pfx base64cert.txt`, Inhalt von `base64cert.txt`)
- Secret `WINDOWS_CERTIFICATE_PASSWORD`: Export-Passwort des `.pfx`

Vor dem Tauri-Build auf `windows-latest` die Schritte aus der [Tauri-Doku (Import Certificate)](https://v2.tauri.app/distribute/sign/windows/) ausführen (Certificate aus Base64 decodieren und in den Store importieren).

## Kurzfassung

1. Code-Signing-Zertifikat kaufen (OV oder EV).
2. `.pfx` erzeugen und in Windows importieren.
3. Thumbprint + Algorithmus in certmgr ablesen.
4. In `tauri.conf.json` unter `bundle.windows` `certificateThumbprint`, `digestAlgorithm`, `timestampUrl` eintragen.
5. `npm run tauri build` – die .exe wird beim Build signiert.
