/**
 * applet-render-sweep — EVERY Applet row mounted through the Applet frame (AP-0 G6, lane B).
 *
 *   pnpm tsx scripts/applets/applet-render-sweep.ts [--files <dir>] [report.json]
 *
 * Reads every live `app.definition` row and mounts it exactly as `/applets/<slug>` does —
 * `definitionToRecord` → `mountApplet(record, host, scope)` from `@ai-matrx/applets/frame`, with the app's
 * stored-component scope modules — over a memory host (no network: the first paint and the job's idle
 * state, which is what a visitor sees before pressing anything). Then the code-runtime source gate runs on
 * the record's files, as the database trigger does.
 *
 * `--files <dir>` swaps each row's entry file for `<dir>/<slug>.tsx` when present — the converter's output
 * checked BEFORE it is written to the row.
 *
 * `--against-live` ALSO checks every row's @ai-matrx named imports against the versions the DEPLOYED site carries
 * (commit from https://www.aimatrx.com/api/version → pnpm-lock.yaml at that commit → those exact tarballs from
 * npm). A row may use a new package export only once the deployed site has it; run this before writing any row.
 * Rows that would break on the live site get verdict `breaks_on_live`. See scripts/applets/against-live.mjs.
 *
 * Verdicts: ok · unresolved (rendered with named stand-ins) · gate_refused · compile_error · render_threw ·
 * legacy_contract (still reads the old prop contract). Exit 1 on anything but ok.
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY; all reads, no writes.
 */
import { createClient } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";

const args = process.argv.slice(2);
const AGAINST_LIVE = args.includes("--against-live");
const filesDirAt = args.indexOf("--files");
const FILES_DIR = filesDirAt >= 0 ? args[filesDirAt + 1] : null;
const REPORT = args.filter((a, i) => a !== "--against-live" && (filesDirAt < 0 || (i !== filesDirAt && i !== filesDirAt + 1)))[0] ?? resolve(process.cwd(), ".applet-render-sweep.json");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "ResizeObserver"]) {
  if (g[key] === undefined) g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

type Verdict = "ok" | "unresolved" | "gate_refused" | "compile_error" | "render_threw" | "legacy_contract" | "breaks_on_live";
type Row = Record<string, unknown> & { id: string; slug: string; files: Record<string, string> | null; entry: string | null };

const LEGACY_PROPS = /export\s+default\s+function\s+\w*\s*\(\s*\{[^}]*\b(onExecute|response|isStreaming|isExecuting|rateLimitInfo)\b/;
const HOST_SCOPE = { entries: ["react", "lucide-react", "@ai-matrx/design-system/controls", "@ai-matrx/applets/react"], shadowDangerousGlobals: true };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required (read-only sweep).");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const [{ definitionToRecord, DEFINITION_COLUMNS }, { mountApplet }, { createMemoryHost }, { gate }, { renderToStaticMarkup }, { provideStoredComponentScopeModules }] = await Promise.all([
    import("@ai-matrx/applets/platform"),
    import("@ai-matrx/applets/frame"),
    import("@ai-matrx/applets/host"),
    import("@ai-matrx/code-runtime/gate"),
    import("react-dom/server"),
    import("@/lib/code-runtime/stored-scope"),
  ]);
  provideStoredComponentScopeModules();
  const { data, error } = await sb.schema("app").from("definition").select(`${DEFINITION_COLUMNS}, published_to_web`).is("deleted_at", null).order("slug");
  if (error) throw new Error(`Could not read app.definition: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  const results: { slug: string; id: string; public: boolean; verdict: Verdict; detail: string }[] = [];
  for (const row of rows) {
    const entry = row.entry ?? "App.tsx";
    const override = FILES_DIR ? resolve(FILES_DIR, `${row.slug}.tsx`) : null;
    const files = { ...(row.files ?? {}) };
    if (override && existsSync(override)) files[entry] = readFileSync(override, "utf8");
    const verdict = (v: Verdict, detail = "") => results.push({ slug: row.slug, id: row.id, public: row.published_to_web === true, verdict: v, detail });
    if (Object.values(files).some((src) => LEGACY_PROPS.test(src))) {
      verdict("legacy_contract", "the entry still takes the old prop contract");
      continue;
    }
    const refused = gate(files).filter((f) => f.severity === "refuse");
    if (refused.length) {
      verdict("gate_refused", refused.map((f) => `${f.file}:${f.line} ${f.rule} ${f.message}`).join("; "));
      continue;
    }
    const loaded = definitionToRecord({ ...row, files, entry: row.entry ?? (Object.keys(files).length ? entry : null) });
    if (!loaded.ok) {
      verdict("compile_error", loaded.message);
      continue;
    }
    const record = loaded.record;
    // Static scope check: every non-relative import must be in the row's scope entries (or the host's), else the
    // frame draws a stand-in badge for it. Independent of what the first paint happens to render.
    const inScope = new Set<string>([...HOST_SCOPE.entries, ...(((record as { scope?: { entries?: string[] } }).scope?.entries) ?? [])]);
    const outOfScope = new Set<string>();
    for (const src of Object.values(files)) {
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1] ?? m[2];
        if (spec && !spec.startsWith(".") && !inScope.has(spec)) outOfScope.add(spec);
      }
    }
    if (outOfScope.size) {
      verdict("unresolved", `not in scope: ${[...outOfScope].join(", ")}`);
      continue;
    }
    const host = createMemoryHost({ record, viewer: { guest: true, userId: null, organizationIds: [] } });
    const mounted = mountApplet(record, host as never, HOST_SCOPE);
    if (!mounted.ok) {
      verdict("compile_error", mounted.error.message);
      continue;
    }
    try {
      const html = renderToStaticMarkup(createElement(mounted.Component));
      const standIns = [...html.matchAll(/data-unresolved-import="([^"]+)"/g)].map((m) => m[1]);
      const unresolved = (mounted as { unresolved?: string[] }).unresolved ?? standIns;
      if (unresolved.length) verdict("unresolved", unresolved.join(", "));
      else verdict("ok");
    } catch (err) {
      verdict("render_threw", err instanceof Error ? err.message : String(err));
    }
  }
  if (AGAINST_LIVE) {
    // @ts-expect-error plain .mjs helper, no declarations
    const { checkRowsAgainstLive, describeFinding } = await import("./against-live.mjs");
    const effective = rows.map((row) => {
      const entry = row.entry ?? "App.tsx";
      const override = FILES_DIR ? resolve(FILES_DIR, `${row.slug}.tsx`) : null;
      const files = { ...(row.files ?? {}) };
      if (override && existsSync(override)) files[entry] = readFileSync(override, "utf8");
      return { slug: row.slug, files };
    });
    const live = await checkRowsAgainstLive(effective);
    const lines = Object.entries(live.versions as Record<string, string>).filter(([k]) => k.startsWith("@ai-matrx/")).map(([k, v]) => `${k.slice(10)}@${v}`);
    console.log(`against live: deployed commit ${live.commit.slice(0, 10)}; ${lines.join(" ")}`);
    const bySlug = new Map<string, string[]>();
    for (const f of live.findings as { slug: string }[]) bySlug.set(f.slug, [...(bySlug.get(f.slug) ?? []), describeFinding(f)]);
    for (const [slug, details] of bySlug) {
      const res = results.filter((r) => r.slug === slug);
      const detail = [...new Set(details)].join("; ");
      if (res.length) {
        for (const r of res) {
          r.verdict = "breaks_on_live";
          r.detail = detail;
        }
      } else results.push({ slug, id: "", public: false, verdict: "breaks_on_live", detail });
    }
  }
  writeFileSync(REPORT, JSON.stringify(results, null, 2));
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  console.log(`applet render sweep — ${results.length} rows (${results.filter((r) => r.public).length} public)${FILES_DIR ? `, files from ${FILES_DIR}` : ""}${AGAINST_LIVE ? ", against the deployed site" : ""}`);
  for (const v of ["ok", "unresolved", "legacy_contract", "gate_refused", "compile_error", "render_threw", "breaks_on_live"] as const) console.log(`  ${v.padEnd(16)} ${count(v)}`);
  for (const r of results.filter((x) => x.verdict !== "ok")) console.log(`  x ${r.slug}: ${r.verdict} ${r.detail}`);
  console.log(`report: ${REPORT}`);
  if (results.some((r) => r.verdict !== "ok")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
