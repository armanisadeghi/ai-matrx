/**
 * buildAgentPayload — turn arbitrary page/record data into an xml-ish block
 * that gives an AI agent maximum context with minimum ceremony.
 *
 * The envelope always carries the "where am I / what is this / when" context
 * (location, live URL, route, timestamp) plus a FULL JSON dump of the data so
 * every id and field is present no matter how ugly — that raw dump is what
 * keeps it future-proof as record shapes grow.
 *
 * This is the orchestration glue the codebase was missing. It is deliberately
 * decoupled from `features/surfaces/` and `useScreenCapture` so it can drop
 * onto any page today; the optional `context` / `attributes` slots are where a
 * surface manifest's values or a screenshot reference can be threaded in later
 * without changing callsites.
 *
 * Called at copy time (inside the click handler), never at render, so the URL
 * and timestamp reflect the moment the user copied.
 */

export interface AgentPayloadInput {
  /**
   * Root xml tag — what kind of thing this is. Use a stable, kebab/underscore
   * slug, e.g. "sandbox-instance" or "sandbox-instances".
   */
  kind: string;
  /** Where the user is, in words. e.g. "AI Matrx Admin — Sandbox Management". */
  location: string;
  /** One line: what was copied. e.g. "A single sandbox instance row." */
  description: string;
  /** The raw data, dumped to JSON in full. Object or array. */
  data: unknown;
  /** Optional human-readable summary lines, rendered inside <summary>. */
  summary?: string;
  /** Extra attributes on the root tag, e.g. { count: 4, filter: "all" }. */
  attributes?: Record<string, string | number | boolean | null | undefined>;
  /** Extra key/values rendered inside <context> (surface state, ids, etc.). */
  context?: Record<string, string | number | boolean | null | undefined>;
}

function renderAttrs(
  attrs?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!attrs) return "";
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${String(v)}"`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function renderContextEntries(
  ctx?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!ctx) return "";
  return Object.entries(ctx)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<${k}>${String(v)}</${k}>`)
    .join("\n");
}

export function buildAgentPayload(input: AgentPayloadInput): string {
  const { kind, location, description, data, summary, attributes, context } =
    input;

  // Live browser state — the high-value bit. Guarded for SSR even though
  // this only ever runs inside a click handler on a client component.
  const url = typeof window !== "undefined" ? window.location.href : "";
  const route =
    typeof window !== "undefined" ? window.location.pathname : "";

  const contextLines = [
    `<location>${location}</location>`,
    url ? `<url>${url}</url>` : "",
    route ? `<route>${route}</route>` : "",
    `<copied>${description}</copied>`,
    `<copied-at>${new Date().toISOString()}</copied-at>`,
    renderContextEntries(context),
  ]
    .filter(Boolean)
    .join("\n");

  const summaryBlock = summary ? `<summary>\n${summary}\n</summary>\n` : "";

  return `<${kind}${renderAttrs(attributes)}>
<context>
${contextLines}
</context>
${summaryBlock}<data format="json">
${JSON.stringify(data, null, 2)}
</data>
</${kind}>`;
}
