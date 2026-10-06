// features/marketing/seo/site-context/agent-view.ts — the exact text an agent
// receives from `seo_site` action `context`, rebuilt from the envelope the
// screen-run door returns.
//
// The model is handed `tool_output_text(output)` (matrx_ai/tools/models.py):
// Python `json.dumps(output, ensure_ascii=False)` — separators ", " and ": ",
// keys in the server's order. `pythonJsonText` reproduces that byte for byte
// for JSON data (strings, numbers, booleans, null, lists, objects); key order
// survives `JSON.parse`. The size is measured the way the server budgets it
// (`agent_reach._rendered_bytes`): that text carried as a JSON string with
// non-ASCII escaped, in UTF-8 bytes.

/**
 * Keys whose values the server holds as Python floats. `JSON.parse` turns
 * `0.0` into `0`, and Python writes a whole float as `0.0`, so these print
 * with the `.0` the model actually reads (money: `cost.estimate_usd` etc.;
 * a voice's `confidence`). Proven against a live envelope.
 */
const FLOAT_KEY = /(_usd|^confidence)$/;

function pyNumber(value: number, isFloat: boolean): string {
  if (!Number.isFinite(value)) return "null";
  const text = JSON.stringify(value);
  return isFloat && Number.isInteger(value) ? `${text}.0` : text;
}

export function pythonJsonText(value: unknown, isFloat = false): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return pyNumber(value, isFloat);
  if (Array.isArray(value)) return `[${value.map((v) => pythonJsonText(v)).join(", ")}]`;
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pythonJsonText(v, FLOAT_KEY.test(k))}`);
    return `{${parts.join(", ")}}`;
  }
  return "null";
}

/** Bytes of `text` as the server budgets it (a JSON string, non-ASCII escaped). */
export function budgetedBytes(text: string): number {
  const asJsonString = JSON.stringify(text).replace(
    /[\u0080-￿]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return asJsonString.length;
}

export interface ContextPartView {
  name: string;
  source: string | null;
  total: number | null;
  shown: number;
  more: number | null;
  next: string | null;
  note: string | null;
}

const PART_ORDER = ["goals", "page_roles", "competitors", "voice"] as const;

/** One summary line per part the agent received: source, counts, the cut and the empty notes. */
export function contextParts(data: unknown): ContextPartView[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const out: ContextPartView[] = [];
  for (const name of PART_ORDER) {
    const part = record[name];
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    out.push({
      name,
      source: typeof p.source === "string" ? p.source : null,
      total: typeof p.total === "number" ? p.total : null,
      shown: Array.isArray(p.items) ? p.items.length : 0,
      more: typeof p.more === "number" ? p.more : null,
      next: typeof p.next === "string" ? p.next : null,
      note: typeof p.note === "string" ? p.note : null,
    });
  }
  return out;
}
