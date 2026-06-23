// Standalone server presets for matrx-ai API test pages.
// No Redux, no useAdminOverride — all state lives in localStorage.

export interface ServerPreset {
  label: string;
  url: string;
}

export const SERVER_PRESETS: readonly ServerPreset[] = [
  { label: 'ai.app.matrxserver.com', url: 'https://ai.app.matrxserver.com' },
  { label: 'dev.ai.app.matrxserver.com', url: 'https://dev.ai.app.matrxserver.com' },
  { label: 'localhost:8000', url: 'http://localhost:8000' },
  { label: 'localhost:8001', url: 'http://localhost:8001' },
  { label: 'server.app.matrxserver.com', url: 'https://server.app.matrxserver.com' },
  { label: 'ai.dev.codematrx.com', url: 'https://ai.dev.codematrx.com' },
  { label: 'server.dev.codematrx.com', url: 'https://server.dev.codematrx.com' },
] as const;

export const CUSTOM_URL_VALUE = '__custom__';
export const STORAGE_KEY_SERVER = 'matrx-ai-test-server';
export const STORAGE_KEY_TOKEN = 'matrx-ai-test-token';
export const DEFAULT_SERVER_URL = SERVER_PRESETS[0].url;
