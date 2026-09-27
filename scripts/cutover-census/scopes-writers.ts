#!/usr/bin/env npx tsx
/**
 * THE SCOPES WRITERS CENSUS — the scopes switch's fact "every place that writes scopes and context is
 * listed" (seam scopes_screens, prerequisite writers_listed), and the reader census the final switch
 * reads (lane SCOPES-WRITE-THROUGH).
 *
 *   npx tsx scripts/cutover-census/scopes-writers.ts                  measure; print both censuses
 *   npx tsx scripts/cutover-census/scopes-writers.ts --target clone   live catalogue reads on the dev clone
 *   npx tsx scripts/cutover-census/scopes-writers.ts --record         ALSO write the fact through
 *                                                                     platform.cutover_scopes_census_record
 *   npx tsx scripts/cutover-census/scopes-writers.ts --json <file>    write both censuses as JSON
 *   npx tsx scripts/cutover-census/scopes-writers.ts --self-test      prove it can fail (a planted writer
 *                                                                     is unlisted; comments are not code)
 *
 * WRITERS. Every runtime file of matrx-frontend, aidream, matrx-extend and matrx-local that names an old
 * scope write door (the RPCs that write context.*) or writes a context table directly, and every
 * database function that writes one, must be claimed by a row of WRITERS below. A row's status says how
 * it writes today: `proven` — through the record store's scope doors (custom.context_*), so the store is
 * written first where the organization's store is the writer; `carried` — an old door or a direct
 * write whose rows the write-through (context._follow_to_the_copy / the tag follow) carries into the
 * store in the same statement; `flip_time` — replaced or retired by the final switch; `nothing` — not a
 * writer of scopes (named so nobody re-finds it). An unclaimed hit is UNLISTED and keeps the fact false.
 *
 * READERS. Every runtime file that reads context.* directly (the table names, `contextDb(`, the old
 * read RPCs, `route_read(source="context.…")`). Not a gate: while the write-through keeps context.*
 * exact these reads are correct; the list is what the final switch repoints before it stops the image.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadDbEnvFrom } from "../lib/direct-db-env";

type Repo = "matrx-frontend" | "aidream" | "matrx-extend" | "matrx-local";
const ROOT = resolve(import.meta.dirname, "..", "..");
const REPOS: Repo[] = ["matrx-frontend", "aidream", "matrx-extend", "matrx-local"];

export const WRITE_DOORS =
  "create_scope_type|update_scope_type|delete_scope_type|restore_scope_type|create_scope|update_scope|delete_scope|restore_scope|" +
  "create_context_item|update_context_item|delete_context_item|restore_context_item|set_context_value|set_scope_context_value|" +
  "write_context_value|apply_template|apply_template_by_key|apply_template_definition|ctx_seed_template|scope_system_apply|" +
  "accept_scope_suggestion|accept_context_item_suggestion|set_entity_scopes|edu_class_[a-z_]+";
/** An old write door named as a CALL or an RPC name (a quoted string), never a bare word in prose. */
export const WRITER_PATTERN = new RegExp(
  `(["'\`](${WRITE_DOORS})["'\`])|\\b(${WRITE_DOORS})\\s*\\(|` +
    // a direct table write: supabase .from("scopes").insert / .update / .upsert / .delete
    `from\\(\\s*["'\`](scope_types|scopes|context_items|context_item_values)["'\`]\\s*\\)\\s*\\.\\s*(insert|update|upsert|delete)\\b|` +
    // SQL text writing a context table
    `\\b(insert\\s+into|update|delete\\s+from)\\s+context\\.(scope_types|scopes|context_items|context_item_values)\\b`,
  "gi",
);
/** The generated ORM models of the context tables, writing — case-sensitive (Google's OAuth `scopes.update` is not one). */
export const ORM_WRITER_PATTERN = /\b(ScopeTypes|Scopes|ContextItems|ContextItemValues)\.(create|update|delete|bulk_create|get_or_create)\b/g;
export const READER_PATTERN = new RegExp(
  `from\\(\\s*["'\`](scope_types|scopes|context_items|context_item_values|templates|template_scope_types|template_context_items|scope_dataset_instances|context_value_refs)["'\`]\\s*\\)|` +
    `\\bcontextDb\\(|\\bcontext\\.(scope_types|scopes|context_items|context_item_values|templates)\\b|` +
    `["'\`](get_scope_tree|list_scope_types|list_scopes|search_scopes|get_scope_context|get_entity_scopes|list_entities_by_scopes|resolve_full_context|get_user_full_context|list_templates|get_value_history|list_context_value_refs)["'\`]|` +
    `source\\s*=\\s*["'\`]context\\.`,
  "gi",
);

type Status = "proven" | "carried" | "flip_time" | "nothing" | "open";
interface Row {
  id: string;
  what: string;
  status: Status;
  plain: string;
  claims?: Partial<Record<Repo, string[]>>;
  /** Database functions this row answers for (schema.name). */
  functions?: string[];
}

/**
 * THE LIST. Edit a row only with the evidence that changed it.
 */
export const WRITERS: Row[] = [
  {
    id: "S1",
    what: "The web app's one scopes writer",
    status: "proven",
    plain: "features/scopes/service/scopeStore.ts calls only the store's scope doors (custom.context_*); every thunk, screen and suggestion accept writes through it (jest scopeStore.test.ts: 6 clauses red against the legacy writer; census clause red on any new legacy write).",
    claims: { "matrx-frontend": ["features/scopes/service/scopeStore.ts"] },
  },
  {
    id: "S2",
    what: "The legacy scopes service's write methods (kept until the final switch, called by nothing)",
    status: "flip_time",
    plain: "features/scopes/service/scopesService.ts still defines createScopeType … applyTemplate over the old RPCs; scopeStore.test.ts proves no app file calls them; the final switch deletes them.",
    claims: { "matrx-frontend": ["features/scopes/service/scopesService.ts"] },
  },
  {
    id: "S3",
    what: "The agents' context write-back (ctx_patch on a scope cell)",
    status: "proven",
    plain: "aidream context_writeback.py ctx_item → custom.context_value_write (store first where the store writes the organization's scopes); pytest red on the old handler.",
    claims: { aidream: ["aidream/services/conversation_context/context_writeback.py"] },
  },
  {
    id: "S4",
    what: "The store's scope doors themselves",
    status: "proven",
    plain: "custom.context_* call today's scope doors (their checks) and the write-through carries the rows; the value door writes the store first. Suite scopeswt T1–T10.",
    functions: [
      "custom.context_type_write", "custom.context_type_archive", "custom.context_type_restore",
      "custom.context_scope_write", "custom.context_scope_archive", "custom.context_scope_restore",
      "custom.context_item_write", "custom.context_item_archive", "custom.context_item_restore",
      "custom.context_value_write", "custom._ctx_value_write_store", "custom.context_template_apply", "custom.context_tags_set",
      "custom._ctx_bridge", "custom._ctx_store_type", "custom._ctx_store_item", "custom._ctx_store_scope", "custom._ctx_store_value",
    ],
  },
  {
    id: "S5",
    what: "The old scope doors (type, scope, item, value, template, restore)",
    status: "carried",
    plain: "public.create_scope_type … public.set_context_value, apply_template and the restores write context.* as today; in an organization whose store is the writer the write-through carries every row they write (and every cascaded row) into the store in the same statement, and a store refusal refuses them (suite T1, T3, T4, T10).",
    functions: [
      "public.create_scope_type", "public.update_scope_type", "public.delete_scope_type", "public.restore_scope_type",
      "public.create_scope", "public.update_scope", "public.delete_scope", "public.restore_scope",
      "public.create_context_item", "public.update_context_item", "public.delete_context_item", "public.restore_context_item",
      "public.set_context_value", "public.set_scope_context_value", "context.write_context_value",
      "public.apply_template", "public.apply_template_by_key", "public.ctx_seed_template",
      "public.ctx_version_context_item_value",
    ],
  },
  {
    id: "S6",
    what: "The agents' structure tool (scope_system)",
    status: "carried",
    plain: "public.scope_system_apply writes context.* directly; the write-through carries it (tested on the dev clone in a born-on-the-store organization). Its server wrapper is aidream services/scope_system/service.py.",
    functions: ["public.scope_system_apply"],
    claims: { aidream: ["aidream/services/scope_system/**", "packages/matrx-ai/matrx_ai/tools/kinds/scope_tools.py"] },
  },
  {
    id: "S7",
    what: "The knowledge system's suggestion accepts",
    status: "carried",
    plain: "public.accept_scope_suggestion / accept_context_item_suggestion write context.*; the write-through carries them. The web app's accept path writes values and tags through scopeStore.",
    functions: ["public.accept_scope_suggestion", "public.accept_context_item_suggestion"],
    claims: { "matrx-frontend": ["features/kg-suggestions/**"], aidream: ["aidream/db/kgsm_managers.py", "aidream/services/suggestion_sweeps/**"] },
  },
  {
    id: "S8",
    what: "Education: a class's join code and access mode",
    status: "carried",
    plain: "public.edu_class_join_code / edu_class_set_access update a class scope's settings; the write-through carries each settings key as a declared Field of the Classes Table.",
    functions: ["public.edu_class_join_code", "public.edu_class_set_access"],
    claims: { "matrx-frontend": ["features/education/**", "app/api/stripe/**", "app/api/education/**", "app/(public)/invitations/**"] },
  },
  {
    id: "S9",
    what: "Tags (set_entity_scopes / assoc_set_targets to a scope)",
    status: "carried",
    plain: "Tag edges to a scope are written by the associations doors; the tag follow trigger carries each edge's store copy in the same statement in an organization whose store is the writer (suite T6).",
    functions: ["public.set_entity_scopes"],
    claims: { "matrx-frontend": ["features/scopes/service/associationsService.ts"] },
  },
  {
    id: "S11",
    what: "Operator trial scripts that clear a test scope's values",
    status: "carried",
    plain: "aidream tests_trials/rag_tests/clear_scope_values.py updates context.context_item_values directly for a trial organization; in an organization whose store is the writer the write-through carries the update. Not a product path.",
    claims: { aidream: ["tests_trials/**"] },
  },
  {
    id: "S10",
    what: "A template applied from a definition",
    status: "flip_time",
    plain: "public.apply_template_definition has no caller in any repository and no client grant; it carries the reference-field defect apply_template had. Retired (or fixed) by the final switch's retirement window.",
    functions: ["public.apply_template_definition"],
  },
];

/** Files that name a write door without writing scopes — named so nobody re-finds them. */
export const NOT_WRITERS: { repo: Repo; claims: string[]; why: string }[] = [
  { repo: "matrx-frontend", claims: ["features/scopes/service/scopeRows.ts", "features/scopes/types.ts", "features/scopes/redux/**"], why: "types, decoders and the thunks that call scopeStore" },
  { repo: "aidream", claims: ["aidream/api/app.py"], why: "a comment-like registry of the set_context_value grant" },
  { repo: "matrx-frontend", claims: ["features/entitlements/stripe/connect.ts"], why: "edu_class_confer_purchase / revoke_purchase grant or take back a class seat (a scope membership); neither writes a context table (the catalogue census confirms)" },
];

// ── the repos ─────────────────────────────────────────────────────────────────────────────────

function globToRegex(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") out += "[^/]*";
    else out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}
const matchesAny = (path: string, globs: string[]) => globs.some((g) => globToRegex(g).test(path));

/** Code only: comments removed, strings kept (SQL and RPC names live in strings). */
export function codeOnly(path: string, text: string): string {
  if (/\.py$/.test(path)) {
    return text
      .replace(/("""|''')[\s\S]*?\1/g, (m) => (/(insert\s+into|update|delete\s+from)\s+context\./i.test(m) ? m : ""))
      .replace(/(^|\s)#.*$/gm, "$1");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

function runtimeFile(repo: Repo, f: string): boolean {
  if (/(^|\/)(__tests__|tests?|fixtures)\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /(^|\/)test_[^/]*\.py$/.test(f) || /\.d\.ts$/.test(f)) return false;
  switch (repo) {
    case "matrx-frontend":
      return /^(app|features|components|lib|utils|hooks|providers)\//.test(f) && /\.(ts|tsx|js|mjs)$/.test(f);
    case "aidream":
      return /\.(py|ts|tsx)$/.test(f) && !/(^|\/)(scripts|migrations|node_modules|dist|\.venv|_generated)\//.test(f)
        && !/^db\/(models|managers)\//.test(f) && !/(^|\/)types\/database\.types\.ts$/.test(f);
    case "matrx-extend":
      return /^src\//.test(f) && /\.(ts|tsx|js)$/.test(f);
    case "matrx-local":
      return /\.(py|ts|tsx)$/.test(f) && !/(^|\/)(scripts|node_modules|dist|\.venv)\//.test(f);
  }
}

interface Tree { repo: Repo; root: string; sha: string; files: string[] }

function readRepo(repo: Repo): Tree | null {
  const root = repo === "matrx-frontend" ? ROOT : resolve(ROOT, "..", repo);
  if (!existsSync(resolve(root, ".git"))) return null;
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { repo, root, sha: git("rev-parse", "HEAD").trim(), files: git("ls-files").split("\n").filter(Boolean) };
}

export interface Hit { repo: Repo; file: string; names: string[] }

export function hitsIn(repo: Repo, file: string, text: string, ...patterns: RegExp[]): Hit | null {
  const code = codeOnly(file, text);
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const m of code.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"))) {
      found.push(m[0].replace(/\s+/g, " ").slice(0, 60));
    }
  }
  const names = [...new Set(found)];
  return names.length ? { repo, file, names } : null;
}

export function claimed(hit: Hit): boolean {
  for (const row of WRITERS) if (matchesAny(hit.file, row.claims?.[hit.repo] ?? [])) return true;
  for (const n of NOT_WRITERS) if (n.repo === hit.repo && matchesAny(hit.file, n.claims)) return true;
  return false;
}

// ── the database ──────────────────────────────────────────────────────────────────────────────

function readRef(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

async function connect(target: "production" | "clone"): Promise<pg.Client> {
  let cfg: pg.ClientConfig;
  if (target === "clone") {
    const ref = readRef(resolve(ROOT, "..", "common-docs/operations/clone/CLONE-REF"));
    cfg = { host: ref.pooler_host, port: 5432, user: ref.pooler_user, password: readFileSync(ref.password_file!, "utf8").trim(), database: ref.database };
  } else {
    const env = loadDbEnvFrom(ROOT);
    if ("missing" in env) throw new Error(`no database connection: ${env.missing.join(", ")}`);
    cfg = { host: env.host, port: env.port, user: env.user, password: env.password, database: env.database };
  }
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false }, application_name: "scopes-writers-census", connectionTimeoutMillis: 15_000 });
  await client.connect();
  const active = Number((await client.query("select count(*) as n from cron.job where active")).rows[0].n);
  if (target === "clone" && active > 0) throw new Error("--target clone reached a database with active cron jobs; nothing measured");
  if (target === "production" && active === 0) throw new Error("--target production reached the clone; nothing measured");
  return client;
}

/** Every database function that writes a context table (the catalogue, not a list anyone typed). */
const DB_WRITERS_SQL = `
  select n.nspname || '.' || p.proname as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema', 'graveyard', 'deprecated')
     and p.prokind = 'f'
     and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+(context\\.)?(scope_types|scopes|context_items|context_item_values)\\M'
   group by 1 order by 1`;

// ── main ──────────────────────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--self-test")) return selfTest();
  const target = (argv.includes("--target") ? argv[argv.indexOf("--target") + 1] : "production") as "production" | "clone";
  const record = argv.includes("--record");
  const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;

  const trees: Tree[] = [];
  const missing: string[] = [];
  for (const repo of REPOS) {
    const t = readRepo(repo);
    if (t) trees.push(t);
    else missing.push(repo);
  }
  const writerHits: Hit[] = [];
  const readerHits: Hit[] = [];
  for (const t of trees) {
    for (const f of t.files) {
      if (!runtimeFile(t.repo, f)) continue;
      const abs = resolve(t.root, f);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, "utf8");
      const w = hitsIn(t.repo, f, text, WRITER_PATTERN, ORM_WRITER_PATTERN);
      if (w) writerHits.push(w);
      const r = hitsIn(t.repo, f, text, READER_PATTERN);
      if (r) readerHits.push(r);
    }
  }
  const unlistedFiles = writerHits.filter((h) => !claimed(h));

  let dbWriters: string[] = [];
  let dbError: string | null = null;
  let db: pg.Client | null = null;
  try {
    db = await connect(target);
    dbWriters = (await db.query(DB_WRITERS_SQL)).rows.map((r: { fn: string }) => r.fn);
  } catch (e) {
    dbError = (e as Error).message;
  }
  const listedFns = new Set(WRITERS.flatMap((r) => r.functions ?? []));
  const unlistedFns = dbWriters.filter((fn) => !listedFns.has(fn) && !fn.startsWith("custom._ctx_"));

  const unlisted = [
    ...unlistedFiles.map((h) => ({ kind: "file", repo: h.repo, where: h.file, names: h.names })),
    ...unlistedFns.map((fn) => ({ kind: "function", repo: "database", where: fn, names: [fn] })),
  ];
  const census = {
    target,
    repos: Object.fromEntries(trees.map((t) => [t.repo, t.sha])),
    script_sha256: createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),
    rows: WRITERS.map(({ id, what, status, plain }) => ({ id, what, status, plain })),
    unlisted,
    db_writers: dbWriters,
    readers: readerHits.map((h) => ({ repo: h.repo, file: h.file, names: h.names })),
  };

  console.log(`SCOPES WRITERS CENSUS — catalogue on ${target}; code at ${trees.map((t) => `${t.repo} ${t.sha.slice(0, 10)}`).join(" · ")}`);
  for (const r of WRITERS) console.log(`  ${r.id.padEnd(4)} ${r.status.padEnd(9)} ${r.what}`);
  console.log(`  database functions writing context.*: ${dbWriters.length} (${unlistedFns.length} unlisted)`);
  for (const u of unlisted) console.log(`  UNLISTED ${u.repo} ${u.where}: ${u.names.join(", ")}`);
  const byRepo = new Map<string, number>();
  for (const h of readerHits) byRepo.set(h.repo, (byRepo.get(h.repo) ?? 0) + 1);
  console.log(`  READERS of context.* (not a gate; the final switch repoints them): ${[...byRepo].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (missing.length) console.log(`  NOT MEASURED: ${missing.join(", ")} not checked out beside this one`);
  if (dbError) console.log(`  NOT MEASURED: database — ${dbError}`);

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(census, null, 2));
  if (record) {
    if (missing.some((m) => m !== "matrx-local") || dbError || !db) {
      console.error("REFUSED: a census that did not read every repository and the catalogue is not recorded.");
      return 2;
    }
    const out = await db.query("select platform.cutover_scopes_census_record($1::jsonb) as out", [JSON.stringify(census)]);
    console.log(`  RECORDED: ${JSON.stringify(out.rows[0].out)}`);
  }
  await db?.end();
  const open = WRITERS.filter((r) => r.status === "open").length;
  if (dbError || missing.some((m) => m !== "matrx-local")) return 2;
  return open === 0 && unlisted.length === 0 ? 0 : 1;
}

function selfTest(): number {
  const planted = hitsIn("matrx-frontend", "features/notes/planted.ts", 'await supabase.rpc("set_context_value", { p_payload });', WRITER_PATTERN);
  if (!planted || claimed(planted)) {
    console.error("SELF-TEST RED: a planted set_context_value call in an unclaimed file was not found unlisted");
    return 1;
  }
  const comment = hitsIn("matrx-frontend", "features/notes/planted.ts", "// we used to call set_context_value( here", WRITER_PATTERN);
  if (comment) {
    console.error("SELF-TEST RED: a comment counted as a writer");
    return 1;
  }
  const direct = hitsIn("matrx-frontend", "features/notes/planted.ts", 'contextDb(supabase).from("context_items").update({ key: "x" })', WRITER_PATTERN);
  if (!direct) {
    console.error("SELF-TEST RED: a direct context_items update was not seen");
    return 1;
  }
  const store = hitsIn("matrx-frontend", "features/scopes/service/scopeStore.ts", 'await customDoor().rpc("context_value_write", {})', WRITER_PATTERN);
  if (store) {
    console.error("SELF-TEST RED: a store door call counted as an old writer");
    return 1;
  }
  console.log("SELF-TEST GREEN — a planted old writer is unlisted, comments are not code, a direct table write is seen, a store door is not an old writer.");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`scopes writers census could not run: ${(e as Error).message}`);
    process.exit(2);
  },
);
