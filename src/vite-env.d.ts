/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Website URL for browser sign-in (e.g. https://ihost.one). If unset, derived from API host with port 3020. */
  readonly VITE_WEBSITE_URL?: string;
  /** Relay (FRP) public token for Share server. Set in .env or GitHub Secrets; do not commit. */
  readonly VITE_RELAY_PUBLIC_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
