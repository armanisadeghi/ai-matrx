/**
 * The HUMAN flavor of a tool result / tool bundle, for the Copy button's
 * `human` callback. A result that carries a kind (an object with `__kind`, a
 * string of kind JSON, a kind nested anywhere) copies as that kind's markdown —
 * never as raw `{"__kind":…}` JSON. Everything else is exactly what it was
 * (strings verbatim, other values as pretty JSON). The `json` / agent copy of
 * the same button keeps the data untouched: `__kind` is data.
 */

import { kindValueToMarkdown } from "@host/features/canvas/export/exportArtifactMarkdown";
import { valueCarriesKind } from "@host/features/content-ir/surfaces/json-kind-signal";
import { kindTextToMarkdown } from "@host/features/content-ir/surfaces/kind-text-to-markdown";

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** A value's kind markdown when it carries a kind; otherwise `null`. */
export function kindMarkdownOf(value: unknown): string | null {
  if (typeof value === "string") {
    const md = kindTextToMarkdown(value);
    return md === value ? null : md;
  }
  if (value === null || typeof value !== "object" || !valueCarriesKind(value)) {
    return null;
  }
  const own = (value as Record<string, unknown>).__kind;
  if (!Array.isArray(value) && typeof own === "string" && own.trim()) {
    return kindValueToMarkdown(value as Record<string, unknown>);
  }
  return kindTextToMarkdown(prettyJson(value));
}

/** One tool result as a person copies it. */
export function resultToHuman(result: unknown): string {
  const markdown = kindMarkdownOf(result);
  if (markdown !== null) return markdown;
  if (typeof result === "string") return result;
  return prettyJson(result);
}

/** One `{tool, input, result, error?}` bundle as a person copies it. */
export function bundleToHuman(bundle: { result: unknown }): string {
  const markdown = kindMarkdownOf(bundle.result);
  if (markdown === null) return prettyJson(bundle);
  return `${prettyJson({ ...bundle, result: undefined })}\n\nResult\n\n${markdown}`;
}
