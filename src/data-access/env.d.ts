/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" (default) or "api". See src/data-access/config.ts. */
  readonly VITE_DATA_SOURCE?: string;
  /** FastAPI base URL used in api mode. */
  readonly VITE_API_BASE_URL?: string;
  /** SMART sandbox launch: "true" to enable (default off). See src/smart/config.ts. */
  readonly VITE_SMART_ENABLED?: string;
  readonly VITE_SMART_CLIENT_ID?: string;
  readonly VITE_SMART_SCOPES?: string;
  readonly VITE_SMART_REDIRECT_URI?: string;
  readonly VITE_SMART_STANDALONE_ISS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
