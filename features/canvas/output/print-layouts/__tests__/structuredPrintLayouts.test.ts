/**
 * The structured print layouts over REAL data:
 *  - every stored shape of every structured type (canvas_items rows, 2026-10-08:
 *    kind objects, JSON text, legacy wrapped JSON, legacy markdown) → a layout,
 *    snapshotted; nothing unreadable ever answers "no data" (null → default path);
 *  - the generic kind-value layout over EVERY registered kind schema (591 on
 *    2026-10-08) with a value generated from the schema, plus every registry
 *    sample: never throws, never prints raw JSON;
 *  - a real message carrying 19 artifacts, composed the way a message's Print
 *    composes it: each structured block prints as its layout, not its source.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { getBlockPrinter, type PrintBlockOutput } from "@ai-matrx/print/core";
import { resolvePrintBlocks } from "@ai-matrx/print/markdown";
import { renderKindValueHtml, setKindSchemaSourceForPrint, type JsonSchema } from "../kindValuePrinter";
import { GENERIC_KIND_PRINT_KEYS } from "../registerStructuredPrinters";
import { STRUCTURED_LAYOUTS } from "../structuredTypePrinters";
// Only this lane's registrations (artifact-printers also loads other lanes' printers).

interface CanvasRow {
  type: string;
  form: "object" | "json" | "md";
  id: string;
  data: unknown;
}
interface KindRow {
  kind: string;
  label: string | null;
  schema: JsonSchema | null;
  sample: unknown;
}

const FIXTURES = join(__dirname, "fixtures");
const ROWS: CanvasRow[] = JSON.parse(readFileSync(join(FIXTURES, "canvas-rows.json"), "utf8"));
const KINDS: KindRow[] = JSON.parse(gunzipSync(readFileSync(join(FIXTURES, "kind-registry.json.gz"))).toString("utf8"));
const BY_KIND = new Map(KINDS.map((k) => [k.kind, k]));

setKindSchemaSourceForPrint(async (kind) => {
  const row = BY_KIND.get(kind);
  return { schema: row?.schema ?? null, label: row?.label ?? null };
});

/** A JSON object literal anywhere in the output: `{"key":` — what "printed as raw JSON" looks like. */
const RAW_JSON_PATTERN = /\{\s*(&quot;|")[^"&]{1,80}(&quot;|")\s*:/;
/** Layout-produced raw JSON: code blocks (a field whose own content is JSON-LD, a config) are content, not layout. */
const RAW_JSON = { test: (html: string) => RAW_JSON_PATTERN.test(html.replace(/<pre>[\s\S]*?<\/pre>/g, "")) };

/** True when any string inside `value` itself carries JSON text (then the output may quote it). */
function carriesJsonText(value: unknown): boolean {
  if (typeof value === "string") return RAW_JSON_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(carriesJsonText);
  if (value && typeof value === "object") return Object.values(value).some(carriesJsonText);
  return false;
}

async function htmlOf(answer: ReturnType<NonNullable<ReturnType<typeof getBlockPrinter>>["toPrintHtml"] & {}>): Promise<string | null> {
  const out = (await answer) as PrintBlockOutput | null;
  if (!out) return null;
  if (!("html" in out)) throw new Error(`expected html, got ${JSON.stringify(out).slice(0, 200)}`);
  return out.html;
}

function visibleText(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

describe("structured type layouts over real stored rows", () => {
  it("covers all 16 structured types", () => {
    expect(STRUCTURED_LAYOUTS.map((l) => l.type).sort()).toEqual(
      [
        "code_edit_error",
        "comparison",
        "decision-tree",
        "progress",
        "questionnaire",
        "recipe",
        "research",
        "resources",
        "stats",
        "structured_info",
        "table",
        "tasks",
        "timeline",
        "transcript",
        "tree",
        "troubleshooting",
      ].sort(),
    );
    for (const { type, kinds } of STRUCTURED_LAYOUTS) {
      expect(getBlockPrinter(type)?.toPrintHtml).toBeInstanceOf(Function);
      for (const kind of kinds) expect(getBlockPrinter(kind)).toBe(getBlockPrinter(type));
    }
  });

  it.each(ROWS.map((row) => [`${row.type} (${row.form}) ${row.id}`, row] as const))("%s prints as its layout", async (_name, row) => {
    const printer = getBlockPrinter(row.type);
    const raw = typeof row.data === "string" ? row.data : JSON.stringify(row.data);
    const html = await htmlOf(printer!.toPrintHtml!(row.data, { type: row.type, raw }));
    // The research markdown row is a prose report (no findings) — it keeps the default markdown path.
    if (row.type === "research" && row.form === "md") {
      expect(html).toBeNull();
      return;
    }
    expect(html).not.toBeNull();
    const text = visibleText(html!);
    expect(text.length).toBeGreaterThan(5);
    expect(RAW_JSON.test(html!)).toBe(false);
    expect(text).not.toMatch(/no data|nothing to print/i);
    expect(html).toMatchSnapshot();
  });

  it("returns null (default path) for data a layout cannot read — never a 'no data' page", async () => {
    for (const { type } of STRUCTURED_LAYOUTS) {
      const printer = getBlockPrinter(type)!;
      expect(printer.toPrintHtml!({ unrelated: true }, { type, raw: "" })).toBeNull();
      expect(printer.toPrintHtml!(42, { type, raw: "42" })).toBeNull();
    }
  });

  it("reads the same timeline from its object, JSON-text and wrapped forms", async () => {
    const value = ROWS.find((r) => r.type === "timeline" && r.form === "object")!.data;
    const printer = getBlockPrinter("timeline")!;
    const a = await htmlOf(printer.toPrintHtml!(value, { type: "timeline", raw: "" }));
    const b = await htmlOf(printer.toPrintHtml!(JSON.stringify(value), { type: "timeline", raw: "" }));
    const c = await htmlOf(printer.toPrintHtml!({ timeline: value }, { type: "timeline", raw: "" }));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});

// ─── a value for any schema ───────────────────────────────────────────────────

function deref(node: unknown, root: JsonSchema, guard = 0): JsonSchema {
  let n = (node && typeof node === "object" ? node : {}) as JsonSchema;
  if (guard > 10) return n;
  if (typeof n.$ref === "string") {
    let target: unknown = root;
    for (const part of n.$ref.slice(2).split("/")) target = (target as Record<string, unknown> | undefined)?.[part];
    n = { ...deref(target, root, guard + 1), ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== "$ref")) };
  }
  const branches = (n.anyOf ?? n.oneOf) as unknown[] | undefined;
  if (Array.isArray(branches)) {
    const real = branches.map((b) => deref(b, root, guard + 1)).find((b) => b.type !== "null");
    if (real) n = { ...real, title: n.title };
  }
  return n;
}

function synth(node: unknown, root: JsonSchema, key: string, depth: number): unknown {
  const s = deref(node, root);
  if (depth > 6) return `deep ${key}`;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.const !== undefined) return s.const;
  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== "null") : (s.type as string | undefined);
  if (type === "object" || (!type && s.properties)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((s.properties as Record<string, unknown>) ?? {})) out[k] = synth(v, root, k, depth + 1);
    return out;
  }
  if (type === "array") return [synth(s.items, root, key, depth + 1), synth(s.items, root, key, depth + 1)];
  if (type === "integer") return 3;
  if (type === "number") return 2.5;
  if (type === "boolean") return true;
  if (/url|href|link/i.test(key)) return "https://example.com/page";
  if (/description|body|content|summary|notes?|text/i.test(key)) return `A longer ${key} paragraph.\n\nWith a second paragraph that reads as prose and wraps across the line.`;
  return `Sample ${key}`;
}

describe("the generic kind-value layout", () => {
  it(`renders every registered kind schema (${KINDS.length}) from a schema-generated value`, () => {
    expect(KINDS.length).toBeGreaterThan(500);
    const failures: string[] = [];
    for (const row of KINDS) {
      const schema = (row.schema ?? {}) as JsonSchema;
      const value = { ...(synth(schema, schema, row.kind, 0) as Record<string, unknown>), __kind: row.kind };
      try {
        const html = renderKindValueHtml(value, row.schema, row.label);
        if (RAW_JSON.test(html)) failures.push(`${row.kind}: raw JSON`);
        if (visibleText(html).length < 3) failures.push(`${row.kind}: empty`);
      } catch (error) {
        failures.push(`${row.kind}: threw ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("renders every registry sample value without raw JSON", () => {
    const samples = KINDS.filter((k) => k.sample && typeof k.sample === "object" && !Array.isArray(k.sample));
    expect(samples.length).toBeGreaterThan(100);
    const failures: string[] = [];
    for (const row of samples) {
      const value = { __kind: row.kind, ...(row.sample as Record<string, unknown>) };
      const html = renderKindValueHtml(value, row.schema, row.label);
      // A sample's own string fields may quote JSON; only count braces the layout itself produced.
      const own = carriesJsonText(row.sample);
      if (!own && RAW_JSON.test(html)) failures.push(row.kind);
    }
    expect(failures).toEqual([]);
  });

  // Ten diverse real kinds (registry samples): SEO, keywords, page planning, CMS, media, study, tasks.
  const PROOF_KINDS = [
    "seo_meta_options",
    "seo_package",
    "keyword_search_metrics",
    "keyword_relationship_map",
    "plan_page_outline",
    "cms_page_build",
    "media_chapters",
    "media_list_ranking_result",
    "study_plan",
    "study_notes",
  ];

  it.each(PROOF_KINDS.filter((k) => BY_KIND.get(k)?.sample).map((k) => [k]))("lays out %s from its schema", async (kind) => {
    const row = BY_KIND.get(kind)!;
    const value = { __kind: kind, ...(row.sample as Record<string, unknown>) };
    const printer = getBlockPrinter(kind)!;
    const html = await htmlOf(printer.toPrintHtml!(value, { type: kind, raw: "" }));
    expect(html).not.toBeNull();
    expect(RAW_JSON.test(html!)).toBe(false);
    expect(html).toMatchSnapshot();
  });

  it("proves at least eight diverse real kinds", () => {
    expect(PROOF_KINDS.filter((k) => BY_KIND.get(k)?.sample).length).toBeGreaterThanOrEqual(8);
  });

  it("answers every kind slug no other printer claims, and dispatches a ```json kind value", async () => {
    expect(GENERIC_KIND_PRINT_KEYS.length).toBeGreaterThan(400);
    const fence = await htmlOf(
      getBlockPrinter("json")!.toPrintHtml!({ __kind: "progress_tracker", title: "T", phases: [{ name: "P", steps: [{ text: "s", completed: true }] }] }, { type: "json", raw: "" }),
    );
    expect(fence).toContain("matrx-pl-bar"); // the progress layout, not the generic one
    expect(getBlockPrinter("json")!.toPrintHtml!({ plain: "json" }, { type: "json", raw: "" })).toBeNull();
  });
});

describe("a message's Print composes each block through its layout", () => {
  it("prints the 19-artifact cheese message with structured blocks laid out, not as source", async () => {
    const markdown = readFileSync(join(FIXTURES, "cheese-message.md"), "utf8");
    const answers = await resolvePrintBlocks(markdown, "article", async (block) => {
      const printer = getBlockPrinter(block.type);
      if (!printer?.toPrintHtml) return null;
      const text = block.body.trim();
      let data: unknown = block.body;
      if (text.startsWith("{") || text.startsWith("[")) {
        try {
          data = JSON.parse(text);
        } catch {
          /* keep text */
        }
      }
      // The HTML page (frame kind) needs the capture engine — not under test here.
      if (block.type === "html") return null;
      return printer.toPrintHtml(data, { type: block.type, raw: block.body, ...(block.attributes ? { attributes: block.attributes } : {}) });
    });
    const byType = new Map<string, string>();
    for (const [key, out] of answers) {
      const type = key.split("\u0000")[1]!;
      if (out && "html" in out) byType.set(type, out.html);
    }
    for (const type of ["comparison", "decision-tree", "recipe", "resources", "structured_info", "tasks", "timeline", "transcript"]) {
      expect(byType.get(type)).toContain('class="matrx-pl"');
      expect(RAW_JSON.test(byType.get(type)!)).toBe(false);
    }
  });
});
