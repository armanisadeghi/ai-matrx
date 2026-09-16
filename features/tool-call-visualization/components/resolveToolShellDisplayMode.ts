export type ToolDisplayPreference = "default" | "verbose" | "minimal";
export type ToolDisplayMode = "auto" | "stay-open" | "never-open";

/**
 * The generic raw-data renderer is disclosure-only: it stays behind the slim
 * tool row until the user explicitly opens it. Purpose-built renderers retain
 * their registry/DB mode and the conversation-level preference behavior.
 */
export function resolveToolShellDisplayMode(
  userPreference: ToolDisplayPreference,
  toolMode: ToolDisplayMode,
  usesGenericFallback: boolean,
): ToolDisplayMode {
  if (usesGenericFallback) return "never-open";
  if (userPreference === "verbose") return "stay-open";
  if (userPreference === "minimal") return "never-open";
  return toolMode;
}
