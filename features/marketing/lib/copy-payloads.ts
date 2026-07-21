/**
 * copy-payloads — the ONE way Marketing surfaces build their Copy /
 * Copy-for-AI pairs (components/agent-copy doctrine: every page, section,
 * card, and row carries a human Copy and an xml "Copy for AI").
 *
 * `webCopy` returns the exact props `<CopyButtons>` wants: a stable xml
 * `kind` (always `web-*`), a location line that names the marketing surface,
 * and a FULL JSON dump of the section's data — never a hand-picked field
 * list. Human text comes from `humanLines` so summaries render as aligned
 * `label: value` lines everywhere.
 *
 * Callsites pass `human`/`agent` through as functions (CopyButtons resolves
 * at click time) — keep data references live, do not pre-render strings at
 * component render.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

export interface WebCopyInput {
  /** Stable root xml tag, e.g. "web-page-serp". Always `web-` prefixed. */
  kind: string;
  /** Toast/tooltip label, e.g. "Search result preview". */
  label: string;
  /** One line: what this payload is. */
  description: string;
  /** Where the user is — section/page name; site + brand get appended. */
  surface: string;
  /** Full raw data for the agent JSON dump. */
  data: unknown;
  /** Human-readable summary lines (also rendered into <summary>). */
  lines: Array<[string, string | number | null | undefined]>;
  attributes?: AgentPayloadInput["attributes"];
  context?: AgentPayloadInput["context"];
}

/**
 * Location line for MatrxDataTable `copy` configs — the table primitive builds
 * its own agent envelope, so it only needs the marketing-flavored location
 * string `webCopy` would otherwise stamp.
 */
export function webLocation(surface: string): string {
  return `AI Matrx — Marketing — ${surface}`;
}

/** `label: value` lines, skipping empty values — the human copy flavor. */
export function humanLines(
  lines: Array<[string, string | number | null | undefined]>,
): string {
  return lines
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function webCopy(input: WebCopyInput): {
  label: string;
  human: () => string;
  agent: () => AgentPayloadInput;
} {
  return {
    label: input.label,
    human: () => humanLines(input.lines),
    agent: () => ({
      kind: input.kind,
      location: `AI Matrx — Marketing — ${input.surface}`,
      description: input.description,
      data: input.data,
      summary: humanLines(input.lines),
      attributes: input.attributes,
      context: input.context,
    }),
  };
}
