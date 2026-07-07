/**
 * `mermaid_legacy_text` — the named parser strategy behind the mermaid fence
 * surfaces (kind_surface: fence_lang/mermaid AND fence_lang/mmd →
 * mermaid_diagram).
 *
 * The content is a DSL string, so "parsing" is framing removal: the fence
 * body IS the canonical `code`, verbatim. Like flashcards-legacy-text, the
 * strategy accepts BOTH host framings — a region text that still carries the
 * literal ``` fence lines, or inner-only body text — so accumulator and
 * splitter converge to the identical value (identical values → identical
 * envelope fingerprints).
 *
 * Title: reuses the EXISTING extractor (`extractMermaidTitle` — the same
 * frontmatter reader MermaidBlock itself renders through; never a second
 * grammar). Frontmatter stays inside `code` untouched; `title` is a
 * convenience copy on the canonical value so `__kind` JSON consumers see it
 * without re-parsing the DSL.
 *
 * NOTE (integration): the hosts' fence-finalize hook does not exist yet —
 * XML regions are the only convergence path today (surfaces/xml-finalize.ts).
 * The live `kind_surface` fence rows + this strategy are the ready halves;
 * the central integration pass lands the hook and maps the strategy name to
 * this function.
 */

import { extractMermaidTitle } from "@/components/mermaid/diagram-type";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening fence line with the mermaid/mmd language token — host framing. */
const OPENING_FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*(?:mermaid|mmd)[^\n]*\n/i;
/** Trailing closing fence line — host framing. */
const CLOSING_FENCE_RE = /\n\s*(?:`{3,}|~{3,})\s*$/;

/**
 * Completed mermaid fence region text → canonical mermaid_diagram value, or
 * null when the region has no source at all (the caller treats null as parse
 * failure: loud, legacy rendering untouched).
 */
export function mermaidLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  const inner = regionText
    .replace(OPENING_FENCE_RE, "")
    .replace(CLOSING_FENCE_RE, "");

  // Whole-document trim only: leading/trailing blank space is insignificant
  // to mermaid and normalizing it makes both host framings value-identical.
  // Interior lines (indentation-sensitive per-line) stay verbatim.
  const code = inner.trim();
  if (code === "") return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "mermaid_diagram",
    code,
  };
  const title = extractMermaidTitle(code);
  if (title) value.title = title;
  return value;
}
