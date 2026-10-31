/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" runs the UI against the in-memory mock backend (src/lib/mock-api.ts). */
  readonly VITE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
