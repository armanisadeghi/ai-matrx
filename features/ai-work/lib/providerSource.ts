export const PROVIDER_SOURCE_APPS = [
  "claude-code",
  "codex",
  "cursor",
  "vscode",
] as const;

export type ProviderSourceApp = (typeof PROVIDER_SOURCE_APPS)[number];

export function isProviderSourceApp(value: string): value is ProviderSourceApp {
  return PROVIDER_SOURCE_APPS.some((sourceApp) => sourceApp === value);
}
