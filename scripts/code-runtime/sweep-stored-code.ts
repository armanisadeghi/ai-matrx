/**
 * sweep-stored-code — THE BREADTH SWEEP for `@ai-matrx/code-runtime`
 * (Applets CONTRACTS §7): every live stored body that reaches an in-page
 * compiler, compiled through the app's ONE compile path
 * (`compileStoredComponent`), and rendered.
 *
 *   pnpm tsx scripts/code-runtime/sweep-stored-code.ts [report.json]
 *
 * What it reads (live, never a fixture):
 *   - content_ir.kind_component  source='db', active, not deleted, not html;
 *     rendered with the kind's canonical example (props_transform applied),
 *     exactly the props the reader's renderer passes;
 *   - tool.ui                    active, not deleted (DB tool renderers);
 *   - app.definition             not deleted (Applets: component_code and
 *     every non-empty slot body).
 *
 * Verdict per body:
 *   - compile_error   the compiler refused it (a regression unless the old
 *                     compiler refused it too — check the body);
 *   - render_threw    kind components only (they get their real example);
 *   - unresolved      compiled and rendered, with named stand-ins (listed);
 *   - ok.
 * Tool renderers and Applets need live runtime props (a tool call, an agent
 * run), so they are compiled and rendered with empty props and a throw there
 * is recorded as `render_needs_props` — information, never a failure.
 *
 * Exit 1 on any compile_error or render_threw. Reads `.env.local`'s
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY, as the sandbox parity sweep
 * does; all reads, no writes.
 */
import { createClient } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT = process.argv[2] ?? resolve(ROOT, ".code-runtime-sweep.json");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "ResizeObserver"]) {
  if (g[key] === undefined) g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);

type Verdict = "ok" | "unresolved" | "compile_error" | "render_threw" | "render_needs_props";
interface Row { origin: string; table: string; id: string; verdict: Verdict; detail: string | null; unresolved: string[] }

function loadEnv(): Record<string, string> {
  const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 500) return out;
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const [{ compileStoredComponent }, { defaultComponentEntries }, { renderToStaticMarkup }] = await Promise.all([
    import("@/lib/code-runtime/compile-stored"),
    import("@ai-matrx/code-runtime/scope"),
    import("react-dom/server"),
  ]);

  const kinds = await readAll<{ id: string; kind_definition_id: string; component_source: string | null; props_transform: string | null; config: Record<string, unknown> | null }>((a, b) =>
    sb.schema("content_ir").from("kind_component").select("id,kind_definition_id,component_source,props_transform,config").eq("source", "db").eq("is_active", true).is("deleted_at", null).order("id").range(a, b),
  );
  const defs = await readAll<{ id: string; kind: string }>((a, b) => sb.schema("content_ir").from("kind_definition").select("id,kind").order("id").range(a, b));
  const examples = await readAll<{ kind_definition_id: string; data: unknown; is_canonical: boolean | null }>((a, b) =>
    sb.schema("content_ir").from("kind_example").select("kind_definition_id,data,is_canonical").order("kind_definition_id").range(a, b),
  );
  const tools = await readAll<{ id: string; tool_name: string; surface_name: string; inline_code: string | null; allowed_imports: unknown }>((a, b) =>
    sb.schema("tool").from("ui").select("id,tool_name,surface_name,inline_code,allowed_imports").eq("is_active", true).is("deleted_at", null).order("id").range(a, b),
  );
  const apps = await readAll<{ id: string; slug: string | null; component_code: string | null; slot_code: Record<string, unknown> | null; allowed_imports: unknown }>((a, b) =>
    sb.schema("app").from("definition").select("id,slug,component_code,slot_code,allowed_imports").is("deleted_at", null).order("id").range(a, b),
  );

  const kindName = new Map(defs.map((d) => [d.id, d.kind]));
  const exampleOf = new Map<string, unknown>();
  for (const e of examples) if (!exampleOf.has(e.kind_definition_id) || e.is_canonical) exampleOf.set(e.kind_definition_id, e.data);

  const rows: Row[] = [];
  const record = (origin: string, table: string, id: string, verdict: Verdict, detail: string | null, unresolved: string[] = []) =>
    rows.push({ origin, table, id, verdict, detail, unresolved });

  for (const k of kinds) {
    if (String(k.config?.flavor ?? "").toLowerCase() === "html" || !k.component_source?.trim()) continue;
    const kind = kindName.get(k.kind_definition_id) ?? k.kind_definition_id;
    const origin = `kind:${kind}`;
    const declared = Array.isArray(k.config?.allowed_imports) ? (k.config?.allowed_imports as string[]) : defaultComponentEntries();
    const compiled = compileStoredComponent({ code: k.component_source, origin, allowedImports: declared, sandboxDangerousGlobals: true });
    if (!compiled.Component) { record(origin, "content_ir.kind_component", k.id, "compile_error", compiled.error); continue; }
    let data: unknown = exampleOf.get(k.kind_definition_id) ?? {};
    if (k.props_transform?.trim()) {
      const t = compileStoredComponent({ code: k.props_transform, origin: `${origin}:transform`, allowedImports: [] });
      try { if (typeof t.Component === "function") data = (t.Component as unknown as (d: unknown) => unknown)(data); } catch { /* the reader passes the raw value too */ }
    }
    try {
      const props: Record<string, unknown> = { data, kind, config: k.config ?? {}, runAction: async () => ({ ok: false, error: "sweep" }) };
      renderToStaticMarkup(createElement(compiled.Component, props));
      const names = compiled.unresolvedImports.map((u) => `${u.identifier}${u.importPath ? ` from ${u.importPath}` : ""}`);
      record(origin, "content_ir.kind_component", k.id, names.length ? "unresolved" : "ok", null, names);
    } catch (err) {
      record(origin, "content_ir.kind_component", k.id, "render_threw", err instanceof Error ? err.message : String(err));
    }
  }

  const softRender = (origin: string, table: string, id: string, code: string, allowed: unknown) => {
    const compiled = compileStoredComponent({ code, origin, allowedImports: allowed as string[] | null });
    if (!compiled.Component) { record(origin, table, id, "compile_error", compiled.error); return; }
    const names = compiled.unresolvedImports.map((u) => `${u.identifier}${u.importPath ? ` from ${u.importPath}` : ""}`);
    try {
      renderToStaticMarkup(createElement(compiled.Component, {}));
      record(origin, table, id, names.length ? "unresolved" : "ok", null, names);
    } catch (err) {
      record(origin, table, id, "render_needs_props", err instanceof Error ? err.message : String(err), names);
    }
  };
  for (const t of tools) if (t.inline_code?.trim()) softRender(`tool:${t.tool_name}:${t.surface_name}`, "tool.ui", t.id, t.inline_code, t.allowed_imports);
  for (const a of apps) {
    if (a.component_code?.trim()) softRender(`app:${a.slug ?? a.id}`, "app.definition", a.id, a.component_code, a.allowed_imports);
    for (const [slot, code] of Object.entries(a.slot_code ?? {})) {
      if (typeof code === "string" && code.trim()) softRender(`app:${a.slug ?? a.id}:slot:${slot}`, "app.definition", a.id, code, a.allowed_imports);
    }
  }

  writeFileSync(REPORT, JSON.stringify(rows, null, 2));
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log(`swept ${rows.length} stored bodies → ${REPORT}`);
  for (const v of ["ok", "unresolved", "render_needs_props", "compile_error", "render_threw"] as const) console.log(`  ${v.padEnd(20)} ${count(v)}`);
  for (const r of rows.filter((x) => x.verdict === "compile_error" || x.verdict === "render_threw")) console.log(`  ✗ ${r.origin}: ${r.detail}`);
  if (count("compile_error") + count("render_threw") > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[sweep-stored-code] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
