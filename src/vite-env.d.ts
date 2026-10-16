interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_AI_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
