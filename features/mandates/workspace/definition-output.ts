import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

/** The saved definition's output constraints, shared by rendering and export. */
export function outputConstraintsOf(
  mandate: MandateWorkspaceData["mandate"],
): string | null {
  const metadata = (mandate as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).output_constraints;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
