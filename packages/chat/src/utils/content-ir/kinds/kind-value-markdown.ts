/**
 * kind-value-markdown — a kind-carrying value object → markdown, through the host's
 * kind registry when it registers one (`registerKindValueMarkdown`), else the package's
 * generic readable rendering (never a JSON dump, never the `__kind` key).
 */
import { readObjectKind } from "@ai-matrx/content-ir";
import { genericKindMarkdown } from "./kind-markdown-utils";

type KindValueToMarkdown = (value: Record<string, unknown>, fallbackKind?: string) => string;

let registered: KindValueToMarkdown | null = null;

/** The host's registry-backed converter (matrx-frontend: `features/canvas/export/exportArtifactMarkdown`). */
export function registerKindValueMarkdown(impl: KindValueToMarkdown | null): void {
  registered = impl;
}

export function kindValueToMarkdown(
  value: Record<string, unknown>,
  fallbackKind = "artifact",
): string {
  if (registered) return registered(value, fallbackKind);
  const nested = (child: Record<string, unknown>) => kindValueToMarkdown(child);
  return genericKindMarkdown(readObjectKind(value) ?? fallbackKind, value, nested);
}
