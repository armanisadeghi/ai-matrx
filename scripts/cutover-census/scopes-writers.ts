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
import { guardIfProduction } from "../lib/production-guard";

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
  // The six tables that LEAVE (SCOPES-CUTOVER-PLAN decision 3: templates, template_*, System context,
  // user_active_context, context_access_log and scope_door_registry are platform reference data that
  // STAY, so reading them is not a reader of the image — lane SCOPES-READS-SERVER, 2026-09-29).
  `from\\(\\s*["'\`](scope_types|scopes|context_items|context_item_values|scope_dataset_instances|context_value_refs)["'\`]\\s*\\)|` +
    `\\bcontextDb\\(|\\bcontext\\.(scope_types|scopes|context_items|context_item_values|context_value_refs|scope_dataset_instances)\\b|` +
    `source\\s*=\\s*["'\`]context\\.`,
  "gi",
);
/** The contract RPCs whose bodies lanes L6–L8 rewrite over the store with the same arguments and
 * the same answer (SCOPES-CUTOVER-PLAN 2.2). A call of one is a reader of whatever its body reads:
 * counted apart ("through a contract RPC") and judged against the catalogue, never as a direct
 * reader of context.* — and never silently dropped either. */
export const CONTRACT_RPCS =
  "get_scope_tree|list_scope_types|list_scopes|search_scopes|get_scope_context|get_entity_scopes|list_entities_by_scopes|" +
  "resolve_full_context|get_user_full_context|list_templates|get_value_history|list_context_value_refs|list_scope_type_items|scope_system_inspect";
export const RPC_READER_PATTERN = new RegExp(`["'\`](${CONTRACT_RPCS})["'\`]`, "gi");
/** The six scope tables that leave, as the generated ORM names them (lane SCOPES-READS-SERVER). */
const LEAVING_MODELS = "ScopeTypes|Scopes|ContextItems|ContextItemValues|ContextValueRefs|ScopeDatasetInstances";
const LEAVING_TABLES = "scope_types|scopes|context_items|context_item_values|context_value_refs|scope_dataset_instances";
/**
 * THE ORM READERS THE TEXT PATTERN COULD NOT SEE (attack A3 of SCOPES-CUTOVER-PLAN): a model of a
 * leaving table used (`Scopes.filter(…)`, `ContextItems.get_or_none(…)`), imported (`from
 * db.models.context import Scopes`, one per line of a parenthesised import too), loaded by name
 * (`get_db_model("Scopes")`), or reached through its generated manager (`db.managers.context.scopes`,
 * `scopes_manager_instance`). Case-sensitive, so Google's OAuth `scopes` and a "New Scopes" label are
 * not readers; comments are stripped before it runs.
 */
export const ORM_READER_PATTERN = new RegExp(
  `\\b(${LEAVING_MODELS})(Manager|DTO)?\\s*\\.\\s*[a-z_]\\w*|` +
    `\\bimport\\b[^\\n]*\\b(${LEAVING_MODELS})\\b|` +
    `^[ \\t]+(${LEAVING_MODELS}),?[ \\t]*$|` +
    `\\bget_db_model\\(\\s*["'](${LEAVING_MODELS})["']|` +
    `\\bdb\\.managers\\.context\\.(${LEAVING_TABLES})\\b|` +
    `\\b(${LEAVING_TABLES})_manager_instance\\b`,
  "gm",
);

/**
 * READERS THAT GO WITH THE IMAGE — the copy machinery. They read the old tables BECAUSE their job is
 * to carry them into the store (the follow, the movers, Copy again) or to compare the two sides (the
 * parity referee); they leave with the tables at the contract (SCOPES-CUTOVER-PLAN 4.3.3, lane L12),
 * never before. Claimed here so the count of product readers can reach 0 while they still run; a
 * product file can never hide here, because a row names its files and says why.
 */
export const READERS_WITH_THE_IMAGE: { repo: Repo; claims: string[]; why: string }[] = [
  {
    repo: "aidream",
    claims: [
      "packages/matrx-records/matrx_records/movers/**",
      "packages/matrx-records/matrx_records/switch.py",
    ],
    why: "the scopes mover, the context follow and Copy again read context.* to carry it into the store (they go with the image at L12)",
  },
  {
    repo: "aidream",
    claims: ["aidream/services/conversation_context/context_compare.py", "aidream/services/conversation_context/parity_nightly.py"],
    why: "the parity referee: its old side is the old path by definition (context_parity.py, the inspector)",
  },
];

type Status = "proven" | "carried" | "flip_time" | "nothing" | "open";
interface Row {
  id: string;
  what: string;
  status: Status;
  plain: string;
  claims?: Partial<Record<Repo, string[]>>;
  /** Database functions this row answers for (schema.name). */
  functions?: string[];
  /**
   * Functions this row says write NO context table themselves (they go through the store's doors).
   * One that the catalogue still finds writing context.* is an OLD WRITER LEFT and keeps the fact false.
   */
  writesNothingItself?: string[];
  /**
   * Functions this row says NO client may call any more (lane SCOPES-OLD-WRITERS): the old doors a
   * client used to reach, now reached only by the scope doors in the owner's right and by the
   * server. One that `authenticated` or `anon` can still EXECUTE is an OLD DOOR OPEN and keeps the
   * fact false.
   */
  clientClosed?: string[];
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
      "custom.context_value_write", "custom._ctx_value_write_store", "custom.context_template_apply", "custom.context_template_define", "custom.context_tags_set",
      "custom._ctx_bridge", "custom._ctx_store_type", "custom._ctx_store_item", "custom._ctx_store_scope", "custom._ctx_store_value",
    ],
  },
  {
    id: "S5",
    what: "The old scope doors (type, scope, item, value, template, restore)",
    status: "proven",
    plain: "Closed to clients (lane SCOPES-OLD-WRITERS, 2026-09-29): neither authenticated nor anon holds EXECUTE on any of them, and their register rows say server_only. They are reached only by the store's scope doors (custom.context_*, SECURITY DEFINER since the same lane, so they call these bodies in the owner's right and every decision is still the old body's), by Trash's own restore (entity_undelete / org_trash_restore) and by the server. The write-through carries every row they write into the store in the same statement. Suites scopesoldwriters_clients_lose_red_green.sql (R1 red: a client call of public.create_scope lands; G1 green: refused 42501, G2 every door a screen uses still lands) and scopeswt T1–T10. At the final switch the doors stop calling them.",
    functions: [
      "public.create_scope_type", "public.update_scope_type", "public.delete_scope_type", "public.restore_scope_type",
      "public.create_scope", "public.update_scope", "public.delete_scope", "public.restore_scope",
      "public.create_context_item", "public.update_context_item", "public.delete_context_item", "public.restore_context_item",
      "public.set_context_value", "public.set_scope_context_value", "context.write_context_value",
      "public.apply_template", "public.apply_template_by_key", "public.ctx_seed_template",
      "public.ctx_version_context_item_value",
    ],
    clientClosed: [
      "public.create_scope_type", "public.update_scope_type", "public.delete_scope_type", "public.restore_scope_type",
      "public.create_scope", "public.update_scope", "public.delete_scope", "public.restore_scope",
      "public.create_context_item", "public.update_context_item", "public.delete_context_item", "public.restore_context_item",
      "public.set_context_value", "public.set_scope_context_value", "context.write_context_value",
      "public.apply_template", "public.apply_template_by_key", "public.ctx_seed_template",
    ],
  },
  {
    id: "S6",
    what: "The agents' structure tool (scope_system)",
    status: "proven",
    plain: "public.scope_system_apply writes every scope type, context item, scope and value through custom.context_type_write / _archive, custom.context_item_write / _archive, custom.context_scope_write / _archive and custom.context_value_write (lane SCOPES-OLD-WRITERS); the doors adopted what only this tool could do (move a type's or a scope's parent, clear a type's limit). Same gate, same receipt: the shadow compare in scopesoldwriters_red_green.sql runs one batch of every operation old and new and finds the receipt, the rows and the store equal. Its server wrapper is aidream services/scope_system/service.py.",
    functions: ["public.scope_system_apply"],
    writesNothingItself: ["public.scope_system_apply"],
    claims: { aidream: ["aidream/services/scope_system/**", "packages/matrx-ai/matrx_ai/tools/kinds/scope_tools.py"] },
  },
  {
    id: "S7",
    what: "The knowledge system's suggestion accepts",
    status: "proven",
    plain: "public.accept_scope_suggestion / accept_context_item_suggestion make the type, the scope, each seeded value and the field through custom.context_type_write / context_scope_write / context_value_write / context_item_write (lane SCOPES-OLD-WRITERS); a seeded value the value door refuses now refuses the accept in the door's words. Shadow compare equal (scopesoldwriters_red_green.sql). The web app's accept path writes values and tags through scopeStore.",
    functions: ["public.accept_scope_suggestion", "public.accept_context_item_suggestion"],
    writesNothingItself: ["public.accept_scope_suggestion", "public.accept_context_item_suggestion"],
    claims: { "matrx-frontend": ["features/kg-suggestions/**"], aidream: ["aidream/db/kgsm_managers.py", "aidream/services/suggestion_sweeps/**"] },
  },
  {
    id: "S8",
    what: "Education: a class's join code and access mode",
    status: "proven",
    plain: "public.edu_class_join_code / edu_class_set_access merge into the class row's own settings and write them through custom.context_scope_write (lane SCOPES-OLD-WRITERS); the owner check and every sentence are unchanged. Shadow compare equal after rotate, access mode and disable, image and store (scopesoldwriters_red_green.sql).",
    functions: ["public.edu_class_join_code", "public.edu_class_set_access"],
    writesNothingItself: ["public.edu_class_join_code", "public.edu_class_set_access"],
    claims: { "matrx-frontend": ["features/education/**", "app/api/stripe/**", "app/api/education/**", "app/(public)/invitations/**"] },
  },
  {
    id: "S9",
    what: "Tags (set_entity_scopes / assoc_set_targets to a scope)",
    status: "proven",
    plain: "Every client tag write goes through the tag door custom.context_tags_set (scopeStore.setEntityScopes; SECURITY DEFINER since lane SCOPES-OLD-WRITERS), and the old tag door public.set_entity_scopes is closed to clients. The tag follow trigger writes each edge's `<kind> -> record` copy in the same statement (suite T6). The `-> scope` edge is the image: it stops with every other image write at the final switch, when the tag door writes the record edge alone.",
    functions: ["public.set_entity_scopes"],
    clientClosed: ["public.set_entity_scopes"],
    claims: { "matrx-frontend": ["features/scopes/service/associationsService.ts"] },
  },
  {
    id: "S11",
    what: "Operator trial scripts that clear a test scope's values",
    status: "nothing",
    plain: "RETIRED 2026-09-29 (lane SCOPES-READS-SERVER): aidream tests_trials/rag_tests/clear_scope_values.py updated context.context_item_values directly — behind the store, which every organization now writes first — so it is deleted; the remaining trial scripts read scopes through matrx_records.store.scopes. Not a product path.",
    claims: { aidream: ["tests_trials/**"] },
  },
  {
    id: "S12",
    what: "Tags are filing: the organization's Tag scope type and each tag (aidream 1378)",
    status: "carried",
    plain: "platform.tag_scope_type_id / platform.tag_scope_id (server only, called by platform.file_under_tag and platform.tags_backfill) find-or-create the organization's `tag` scope type and one tag scope by inserting into context.* directly; in an organization whose store is the writer the write-through carries each row into the store in the same statement. At the final switch: make them through custom.context_type_write / context_scope_write.",
    functions: ["platform.tag_scope_id", "platform.tag_scope_type_id"],
  },
  {
    id: "S13",
    what: "Switch back: the copy's own words carried back to the current screens",
    status: "flip_time",
    plain: "platform._cutover_scope_own_words_back, the scopes switch's step to old (platform._cutover_seam_apply), writes a scope type's description / sort order and a field's category / tags / status note back into context.* from the store copy's carried words — only words the copy has, never an erase (suite scopestails_the_copy_carries_own_words B4). It is the store-to-image direction, so it goes when the image does at the final switch.",
    functions: ["platform._cutover_scope_own_words_back"],
  },
  {
    id: "S10",
    what: "A template applied from a definition (and every catalogue template)",
    status: "proven",
    plain: "custom.context_template_define applies a template's scope types and fields through custom.context_type_write / custom.context_item_write (the store's doors, store first where the store writes); custom.context_template_apply hands the catalogue template's definition to it, and public.apply_template_definition is a SECURITY INVOKER wrapper over it that writes nothing itself (no caller, no client grant). Suite scopestails_templates_through_the_doors A1–A6 (red before scopestails_a_template_is_applied_through_the_store_doors.sql).",
    functions: ["custom.context_template_define", "public.apply_template_definition"],
    writesNothingItself: ["custom.context_template_define", "custom.context_template_apply", "public.apply_template_definition"],
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
      // Generated from the live schema (models, managers, auto_config relation lists — in the host
      // and in each package's own db/): they name the 14 outside foreign keys into context.* that the
      // contract drops (L12), and read nothing themselves; their READERS are what this census counts.
      return /\.(py|ts|tsx)$/.test(f) && !/(^|\/)(scripts|migrations|node_modules|dist|\.venv|_generated)\//.test(f)
        && !/(^|\/)db\/(models|managers|helpers)\//.test(f) && !/(^|\/)types\/database\.types\.ts$/.test(f);
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
  const client = guardIfProduction(new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false }, application_name: "scopes-writers-census", connectionTimeoutMillis: 15_000 }), "scopes-writers-census");
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

/** Which of the named functions a client role can still EXECUTE (any overload) — lane SCOPES-OLD-WRITERS. */
const CLIENT_OPEN_SQL = `
  select distinct n.nspname || '.' || p.proname as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname || '.' || p.proname) = any($1::text[])
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
   order by 1`;

/** Which contract RPCs still name a leaving table in their own body (L6–L8 have not rewritten them yet). */
const RPC_BODIES_ON_OLD_SQL = `
  select distinct n.nspname || '.' || p.proname as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'custom', 'context')
     and p.proname = any($1::text[])
     and p.prosrc ~* '\\mcontext\\.(scope_types|scopes|context_items|context_item_values|context_value_refs|scope_dataset_instances)\\M'
   order by 1`;

export function withTheImage(hit: Hit): boolean {
  return READERS_WITH_THE_IMAGE.some((row) => row.repo === hit.repo && matchesAny(hit.file, row.claims));
}

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
  const rpcHits: Hit[] = [];
  for (const t of trees) {
    for (const f of t.files) {
      if (!runtimeFile(t.repo, f)) continue;
      const abs = resolve(t.root, f);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, "utf8");
      const w = hitsIn(t.repo, f, text, WRITER_PATTERN, ORM_WRITER_PATTERN);
      if (w) writerHits.push(w);
      const r = /\.py$/.test(f) ? hitsIn(t.repo, f, text, READER_PATTERN, ORM_READER_PATTERN) : hitsIn(t.repo, f, text, READER_PATTERN);
      if (r) readerHits.push(r);
      const rpc = hitsIn(t.repo, f, text, RPC_READER_PATTERN);
      if (rpc) rpcHits.push(rpc);
    }
  }
  const unlistedFiles = writerHits.filter((h) => !claimed(h));

  let dbWriters: string[] = [];
  let rpcBodiesOnOld: string[] = [];
  let clientOpen: string[] = [];
  let dbError: string | null = null;
  let db: pg.Client | null = null;
  try {
    db = await connect(target);
    dbWriters = (await db.query(DB_WRITERS_SQL)).rows.map((r: { fn: string }) => r.fn);
    rpcBodiesOnOld = (await db.query(RPC_BODIES_ON_OLD_SQL, [CONTRACT_RPCS.split("|")])).rows.map((r: { fn: string }) => r.fn);
    clientOpen = (await db.query(CLIENT_OPEN_SQL, [WRITERS.flatMap((r) => r.clientClosed ?? [])])).rows.map((r: { fn: string }) => r.fn);
  } catch (e) {
    dbError = (e as Error).message;
  }
  const listedFns = new Set(WRITERS.flatMap((r) => r.functions ?? []));
  const unlistedFns = dbWriters.filter((fn) => !listedFns.has(fn) && !fn.startsWith("custom._ctx_"));

  // A ROW THAT SAYS "THROUGH THE DOORS" IS HELD TO IT: a function it names as writing nothing itself
  // that the catalogue still finds writing context.* is an old writer left (lane SCOPES-TAILS, S10).
  const oldWritersLeft = dbError ? [] : WRITERS.flatMap((r) => (r.writesNothingItself ?? []).filter((fn) => dbWriters.includes(fn)).map((fn) => ({ row: r.id, fn })));
  const unlisted = [
    ...unlistedFiles.map((h) => ({ kind: "file", repo: h.repo, where: h.file, names: h.names })),
    ...unlistedFns.map((fn) => ({ kind: "function", repo: "database", where: fn, names: [fn] })),
    ...oldWritersLeft.map(({ row, fn }) => ({ kind: "old_writer_left", repo: "database", where: fn, names: [`${row} says ${fn} writes through the doors, but it writes context.* itself`] })),
    // A ROW THAT SAYS "CLOSED TO CLIENTS" IS HELD TO IT (lane SCOPES-OLD-WRITERS, S5 / S9).
    ...(dbError ? [] : WRITERS.flatMap((r) => (r.clientClosed ?? []).filter((fn) => clientOpen.includes(fn))
      .map((fn) => ({ kind: "old_door_open", repo: "database", where: fn, names: [`${r.id} says ${fn} is closed to clients, but a client role can still EXECUTE it`] })))),
  ];
  const census = {
    target,
    repos: Object.fromEntries(trees.map((t) => [t.repo, t.sha])),
    script_sha256: createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),
    rows: WRITERS.map(({ id, what, status, plain }) => ({ id, what, status, plain })),
    unlisted,
    db_writers: dbWriters,
    readers: readerHits.map((h) => ({ repo: h.repo, file: h.file, names: h.names, with_the_image: withTheImage(h) })),
    product_readers: readerHits.filter((h) => !withTheImage(h)).map((h) => ({ repo: h.repo, file: h.file, names: h.names })),
    contract_rpc_callers: rpcHits.map((h) => ({ repo: h.repo, file: h.file, names: h.names })),
    contract_rpcs_still_reading_context: rpcBodiesOnOld,
    old_doors_open_to_clients: clientOpen,
  };

  console.log(`SCOPES WRITERS CENSUS — catalogue on ${target}; code at ${trees.map((t) => `${t.repo} ${t.sha.slice(0, 10)}`).join(" · ")}`);
  for (const r of WRITERS) console.log(`  ${r.id.padEnd(4)} ${r.status.padEnd(9)} ${r.what}`);
  console.log(`  database functions writing context.*: ${dbWriters.length} (${unlistedFns.length} unlisted)`);
  for (const u of unlisted) console.log(`  UNLISTED ${u.repo} ${u.where}: ${u.names.join(", ")}`);
  const byRepo = new Map<string, number>();
  const product = readerHits.filter((h) => !withTheImage(h));
  for (const r of REPOS) byRepo.set(r, 0);
  for (const h of product) byRepo.set(h.repo, (byRepo.get(h.repo) ?? 0) + 1);
  console.log(`  READERS of context.* — product code (text, ORM models, imports, managers; not a gate): ${[...byRepo].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  for (const h of product) console.log(`    READER ${h.repo} ${h.file}: ${h.names.slice(0, 4).join(", ")}`);
  console.log(`  READERS that go with the image (copy machinery, parity referee): ${readerHits.length - product.length}`);
  console.log(`  CALLERS of the contract RPCs (L6–L8 rewrite their bodies, contract kept): ${rpcHits.length} file(s)` +
    (dbError ? "" : ` — bodies still reading context.*: ${rpcBodiesOnOld.length ? rpcBodiesOnOld.join(", ") : "none"}`));
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
  // THE READER HALF (lane SCOPES-READS-SERVER): the ORM reads a text search could not see.
  const ormPlants: [string, string][] = [
    ["a model read", "rows = await Scopes.filter(id=scope_id).values('id', 'name')"],
    ["a single-line import", "from db.models.context import ContextItems, Templates"],
    ["a parenthesised import member", "from db.models import (\n    Memberships,\n    ScopeTypes,\n)"],
    ["a model loaded by name", "Scopes = get_db_model(\"Scopes\", schema=\"context\")"],
    ["a generated manager", "from db.managers.context.context_items import context_items_manager_instance"],
  ];
  for (const [what, code] of ormPlants) {
    if (!hitsIn("aidream", "aidream/services/planted.py", code, READER_PATTERN, ORM_READER_PATTERN)) {
      console.error(`SELF-TEST RED: ${what} was not seen as a reader of context.* (${code})`);
      return 1;
    }
  }
  const notReaders: [string, string][] = [
    ["a label", 'label="New Scopes"'],
    ["OAuth scopes", "creds.scopes.update(granted)"],
    ["a comment", "# we used to call Scopes.filter( here"],
    ["a docstring", '"""Reads Scopes.filter(...) no more."""'],
    ["the store's reader", "from matrx_records.store.scopes import ScopeReader"],
  ];
  for (const [what, code] of notReaders) {
    if (hitsIn("aidream", "aidream/services/planted.py", code, READER_PATTERN, ORM_READER_PATTERN)) {
      console.error(`SELF-TEST RED: ${what} counted as a reader of context.* (${code})`);
      return 1;
    }
  }
  if (!hitsIn("aidream", "aidream/services/planted.py", 'await call_function(db, "public", "get_scope_tree", org, None)', RPC_READER_PATTERN)) {
    console.error("SELF-TEST RED: a contract RPC call was not seen");
    return 1;
  }
  if (withTheImage({ repo: "aidream", file: "aidream/services/planted.py", names: [] })) {
    console.error("SELF-TEST RED: a product file was claimed as going with the image");
    return 1;
  }
  console.log("SELF-TEST GREEN — a planted old writer is unlisted, comments are not code, a direct table write is seen, a store door is not an old writer; an ORM model read / import / manager of a leaving table is a reader, a label, OAuth scopes and the store's reader are not; a contract RPC call is counted apart.");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`scopes writers census could not run: ${(e as Error).message}`);
    process.exit(2);
  },
);
