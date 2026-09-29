/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" (default) or "api". See src/data-access/config.ts. */
  readonly VITE_DATA_SOURCE?: string;
  /** FastAPI base URL used in api mode. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
