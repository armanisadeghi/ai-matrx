/**
 * check:no-custom-store-code — Guard 7 of the Unified Data System (v6 lane INTEGRATION, W1.8).
 *
 * The record store (`custom.*`: tables, fields, records, views, references, and the `custom.*`
 * functions that are its doors) is the one home for every organization's tables. Apps never write
 * their own custom-data code: they reach the store through the two packages `@ai-matrx/records`
 * (client doors) and `@ai-matrx/records-ui` (UI), source in `aidream/apps/shared/records` and
 * `aidream/apps/shared/records-ui`. This guard fails when an app file touches `custom.*` directly:
 *
 *   - `.schema(…)` whose argument names the store: the literal in any form (`"custom"`,
 *     `"custom" as never`, `(opts?.schema ?? "custom") as never`), or an in-file constant or object
 *     member holding it (`const STORE = "custom"` → `.schema(STORE)`, `S = { store: "custom" }` →
 *     `.schema(S.store)`)
 *   - a `schema:` / `schemaName:` option or registry entry naming it, a `*schema* = "custom"` constant
 *   - a PostgREST `Accept-Profile` / `Content-Profile` header naming it
 *   - SQL naming a store relation or door: `from custom.record`, `"custom"."record"`, `select custom.x(…)`
 *
 * Comments never count — whole-line, block and trailing `// …` — via a lexer that knows strings,
 * template literals and regex literals. A bare "custom.x" string is NOT a touch either: door names
 * in error sentences, knob keys (`custom.data_home_default_order`) and generated registries carry
 * that text without reaching the store. Every app source file is scanned — everything tracked
 * except `NOT_APP` (scripts, migrations, tests, vendor, dot-dirs, root config) — so a new
 * top-level root is covered the day it lands.
 *
 * Every file that does so TODAY is in `TOUCHES_THE_STORE` with its one-line reason, mirroring the
 * census (common-docs projects/data-doctrine-adoption/v6/CENSUS-NO-CUSTOM-CODE.md). The list can
 * only shrink: a new file fails, and an entry whose file no longer touches the store fails as
 * STALE until it is removed. Tests (`__tests__`, `*.test.*`, `*.spec.*`) are out of scope — they
 * stub the store to prove a caller, they do not reach it.
 *
 *   pnpm check:no-custom-store-code              the tree
 *   pnpm check:no-custom-store-code --tracked-only   the tree without untracked (in-progress) files
 *   pnpm check:no-custom-store-code --list       every file that touches the store, with its shapes
 *   pnpm check:no-custom-store-code --self-test  proves the rule fails on a planted in-memory file
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Which tracked paths are NOT app source. Everything else holding code is in scope, so a new
 * top-level source root (`actions/`, `instrumentation-client.ts`, …) is covered the day it lands.
 */
export const NOT_APP: ReadonlyArray<RegExp> = [
  /^scripts\//, /^migrations\//, /^tests?\//, /^test-utils\//, /^e2e\//, /^docs\//, /^public\//,
  /^vendor\//, /^\.[^/]+\//, /^node_modules\//, /^tmp\//,
  /^[^/]+\.config\.[cm]?[jt]s$/, /^jest\.[^/]+$/, /^\.[^/]+$/,
];

const CODE_FILE = /\.(tsx?|mts|cts|mjs|cjs|jsx?)$/;

export function isAppSource(file: string): boolean {
  return CODE_FILE.test(file) && !NOT_APP.some((re) => re.test(file)) && !file.includes("/node_modules/");
}

export function isTest(file: string): boolean {
  return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)__mocks__\//.test(file);
}

/**
 * Blank every comment — block, whole-line AND trailing `// …` — with a small lexer that knows
 * strings, template literals (with `${}` nesting) and regex literals, so `"https://x"` and
 * `/["']\/\//` are never mistaken for comments. Newlines are kept so offsets stay meaningful.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const tpl: number[] = []; // brace depth at which each open template's `${` started
  let depth = 0;
  let lastSig = "";
  const regexAfter = /[(,=:[!&|?{};+\-*%<>~^]$|^$|\b(?:return|typeof|case|do|else|in|of|void|yield|await)$/;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = c;
      continue;
    }
    if (c === "`" || (c === "}" && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === "}") tpl.pop();
      let j = i + 1;
      while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
      if (src[j] === "$") { tpl.push(depth); out += src.slice(i, j + 2); i = j + 2; lastSig = "{"; continue; }
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = "`";
      continue;
    }
    if (c === "/" && regexAfter.test(lastSig)) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        else if (src[j] === "/" && !cls) break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = "/re";
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    out += c;
    if (!/\s/.test(c)) {
      lastSig = /[\w$]/.test(c) ? (/[\w$]$/.test(lastSig) ? lastSig + c : c) : c;
    }
    i++;
  }
  return out;
}

const LIT = String.raw`\\?["'\`]custom\\?["'\`]`;

/**
 * In-file names whose value is the literal "custom": `bindings` (`const STORE = "custom"`) and
 * object `keys` (`const S = { store: "custom" }`). Keys count only inside a `.schema(…)` argument
 * (`.schema(S.store)`); elsewhere a key like `state: "custom"` is far too common to mean the store.
 */
export function customNames(code: string): { bindings: Set<string>; keys: Set<string> } {
  const bindings = new Set<string>();
  const keys = new Set<string>();
  const binding = new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*${LIT}`, "g");
  const key = new RegExp(String.raw`["']?([A-Za-z_$][\w$]*)["']?\s*:\s*${LIT}(?:\s+as\s+const)?\s*[,}\n]`, "g");
  for (const m of code.matchAll(binding)) bindings.add(m[1]);
  for (const m of code.matchAll(key)) keys.add(m[1]);
  return { bindings, keys };
}

/** The text of each `.schema(…)` argument (balanced parentheses). */
function schemaArgs(code: string): string[] {
  const args: string[] = [];
  const re = /\.schema\s*(?:<[^>]*>)?\s*\(/g;
  for (const m of code.matchAll(re)) {
    let j = (m.index ?? 0) + m[0].length;
    let level = 1;
    const start = j;
    while (j < code.length && level > 0) {
      if (code[j] === "(") level++;
      else if (code[j] === ")") level--;
      j++;
    }
    args.push(code.slice(start, j - 1));
  }
  return args;
}

/** An expression names the store: it holds the literal, or a name holding it in-file. */
function namesStore(expr: string, names: Set<string>, members: Set<string> = new Set()): boolean {
  if (new RegExp(LIT).test(expr)) return true;
  for (const m of expr.matchAll(/(\.\s*)?([A-Za-z_$][\w$]*)/g)) {
    if (m[1] ? members.has(m[2]) : names.has(m[2])) return true;
  }
  return false;
}

/** The shapes a file's code uses to reach `custom.*` directly (empty when it does not). */
export function touches(text: string): string[] {
  const code = stripComments(text);
  const { bindings: names, keys } = customNames(code);
  const found = new Set<string>();
  if (schemaArgs(code).some((a) => namesStore(a, names, keys))) found.add("schema-call");
  const option = /\bschema(?:Name)?\s*:\s*([^,}\n]+)/gi;
  for (const m of code.matchAll(option)) if (namesStore(m[1], names)) found.add("schema-option");
  if (new RegExp(String.raw`\b[\w$]*schema[\w$]*\s*=\s*${LIT}`, "i").test(code)) found.add("schema-constant");
  const profile = /\b(?:Accept|Content)-Profile["']?\s*[:,]\s*([^,}\n)]+)/gi;
  for (const m of code.matchAll(profile)) if (namesStore(m[1], names)) found.add("profile-header");
  const sqlKw = String.raw`\b(?:from|join|into|update|table|function|call|perform|select|exists|truncate)\s+`;
  const ident = String.raw`(?:custom|\\?"custom\\?")\s*\.\s*(?:[a-z_]+|\\?"[a-z_]+\\?")`;
  if (new RegExp(sqlKw + ident, "i").test(code) || /\\?"custom\\?"\s*\.\s*\\?"[a-z_]+\\?"/.test(code)) found.add("sql");
  return [...found];
}

/**
 * Every app file that touches the store directly today, each with why it may (or until when).
 * Mirrors CENSUS-NO-CUSTOM-CODE.md row for row. Never add an entry: move the call into
 * `@ai-matrx/records` (or `-ui`) and import it. Removing an entry is the only allowed edit.
 */
export const TOUCHES_THE_STORE: Record<string, string> = {
  "app/(core)/d/[renderId]/page.tsx":
    "move: doc_render_read → new records door docRenderRead",
  "app/(core)/organizations/[orgId]/tables/page.tsx":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere (the no-organization call needs the door's org argument exposed)",
  "app/api/stripe/class-checkout/route.ts":
    "move: server-only context_class_for_checkout → new records door contextClassForCheckout (host passes the service-role data source)",
  "features/data-tables/data-source/record-store-grid.ts":
    "move: migrate_retype → RecordsClient.migrateRetype (exists); view_keys → new door viewKeys",
  "features/data-tables/service.ts":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere",
  "features/files/webhooks/service.ts":
    "ready to move: table_webhook_declare → RecordsClient.tableWebhookDeclare",
  "features/matrx-envelope/referenceResolvers.ts":
    "move: where_id_opens → new records door whereIdOpens",
  "features/organizations/service/organizationStoreContents.ts":
    "move: organization_contents/organization_clear → new records doors organizationContents/organizationClear",
  "features/record-change-approvals/HeldWritesOnTable.tsx":
    "ready to move: work_inbox/work_approval_read → RecordsClient.workInbox/workApprovalRead",
  "features/record-change-approvals/applyRecordChange.ts":
    "ready to move: work_approval_decide/read_record → RecordsClient.workApprovalDecide/readRecord",
  "features/record-change-approvals/approvalDecision.ts":
    "ready to move: work_approval_read → RecordsClient.workApprovalRead",
  "features/scheduling/hooks/useArchivedWatchTriggers.ts":
    "ready to move: table_list_everywhere → RecordsClient.tableListEverywhere",
  "features/sharing/outside/outsideShareService.ts":
    "move: table_share_outside* / table_share_peek → new records share-outside doors",
  "features/sharing/service/sharedResourceDetails.ts":
    "move: where_id_opens → new door whereIdOpens; table_kernel_id/read_records_by_ids → existing tableKernelId/readRecordsByIds doors",
  "features/sharing/service/tableTransfer.ts":
    "move: table_transfer_owner/member_personal_tables → new records doors tableTransferOwner/memberPersonalTables",
  "features/unified-data/hub/doors.ts":
    "move: data_home/_items/_tables/_changed_by, hub_changed_by, shares_outside → new records data-home doors",
  "features/unified-data/record-chat/RecordScopedChat.tsx":
    "ready to move: conversation_scope_bind → RecordsClient.conversationScopeBind",
  "features/unified-data/whereThisTableLives.ts":
    "move: a data-source adapter for where_id_opens → new records door whereIdOpens",
  "features/data-tables/pick-lists/pick-list-index.ts":
    "move: pick_list_index/pick_list_index_everywhere → new records pick-list doors",
  "features/data-tables/pick-lists/service.ts":
    "move: pick_list_create → new records door pickListCreate",
  "lib/knobs/unifiedDataCampaign.register.ts":
    "justified: a register of campaign entry points; its `why` prose quotes store calls, it calls nothing",
  "lib/organizations/linkOrganizationAdmission.ts":
    "move: tables_shared_with_me → new records door tablesSharedWithMe",
  "utils/permissions/registry.ts":
    "justified: the shareable-resource registry declares which schema each type lives in — data, not a call",
  "utils/permissions/service.ts":
    "move: share_lane_set → new records door shareLaneSet",
};

export interface Finding {
  file: string;
  kind: "new" | "stale";
  says: string;
}

export function judge(files: ReadonlyMap<string, string>, allow: Record<string, string> = TOUCHES_THE_STORE): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of files) {
    if (isTest(file)) continue;
    const shapes = touches(text);
    if (shapes.length && !(file in allow)) {
      out.push({ file, kind: "new", says: `touches custom.* directly (${shapes.join(", ")}) — call a door from @ai-matrx/records instead` });
    }
  }
  for (const file of Object.keys(allow)) {
    const text = files.get(file);
    if (text === undefined || !touches(text).length) {
      out.push({ file, kind: "stale", says: "no longer touches custom.* — remove it from TOUCHES_THE_STORE (the list only shrinks)" });
    }
  }
  return out;
}

function tree(trackedOnly = false): Map<string, string> {
  const listed = execFileSync("git", ["ls-files", "--cached", ...(trackedOnly ? [] : ["--others", "--exclude-standard"])], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(isAppSource);
  const files = new Map<string, string>();
  for (const f of listed) {
    try {
      files.set(f, readFileSync(join(REPO, f), "utf8"));
    } catch {
      // Listed by git but deleted in the working tree.
    }
  }
  return files;
}

/** Each shape the rule must catch, planted in memory only — never on disk. */
export const RED_PLANTS: ReadonlyArray<readonly [string, string, string]> = [
  ["literal switch", "features/planted/a.ts", 'export const r = (c: any) => c.schema("custom").rpc("record_list", {});'],
  ["literal cast as never", "features/planted/b.ts", 'export const r = (c: any) => c.schema("custom" as never).rpc("x");'],
  ["literal cast as any", "features/planted/c.ts", "export const r = (c: any) => c.schema('custom' as any);"],
  ["fallback expression", "features/planted/d.ts", 'export const r = (c: any, o?: { schema?: string }) => c.schema((o?.schema ?? "custom") as never);'],
  ["constant of any name", "features/planted/e.ts", 'const STORE = "custom";\nexport const r = (c: any) => c.schema(STORE).rpc("x");'],
  ["object map member", "features/planted/f.ts", 'const S = { store: "custom", files: "files" } as const;\nexport const r = (c: any) => c.schema(S.store);'],
  ["rpc option literal", "features/planted/g.ts", 'export const r = (d: any) => d.rpc("view_keys", {}, { schema: "custom" });'],
  ["rpc option via constant", "features/planted/h.ts", 'const where = "custom";\nexport const r = (d: any) => d.rpc("view_keys", {}, { schema: where });'],
  ["registry entry", "utils/planted/i.ts", 'export const R = { record: { tableName: "record", schemaName: "custom" } };'],
  ["Accept-Profile header", "lib/planted/j.ts", 'export const h = { "Accept-Profile": "custom", apikey: k };'],
  ["Content-Profile header via constant", "lib/planted/k.ts", 'const P = "custom";\nexport const h = { "Content-Profile": P };'],
  ["SQL unquoted", "app/api/planted/l/route.ts", "export const sql = `select id from custom.record where table_id = $1`;"],
  ["SQL quoted identifiers", "app/api/planted/m/route.ts", 'export const sql = `delete from "custom"."portal_principal" where id = $1`;'],
  ["SQL escaped quotes in a string", "app/api/planted/n/route.ts", 'export const sql = "update \\"custom\\".\\"record\\" set x = 1";'],
  ["a URL string before the touch", "features/planted/o.ts", 'const u = "https://db.example.test/rest"; export const r = (c: any) => c.schema("custom");'],
  ["a regex literal with quotes before the touch", "features/planted/p.ts", "const q = /[\"'`]\\/\\//; export const r = (c: any) => c.schema('custom');"],
  ["root actions/", "actions/planted.actions.ts", '"use server";\nexport const r = (c: any) => c.schema("custom");'],
  ["root instrumentation-client.ts", "instrumentation-client.ts", 'export const r = (c: any) => c.schema("custom");'],
];

/** Text the rule must NOT read as a touch. */
export const GREEN_PLANTS: ReadonlyArray<readonly [string, string, string]> = [
  ["whole-line comment", "features/planted/q.ts", '// Schema `custom` is revoked; reads go from custom.record through .schema("custom").\nexport const x = 1;'],
  ["trailing comment", "features/planted/r.ts", 'export const x = 1; // reads from custom.record via .schema("custom") and { schema: "custom" }'],
  ["block comment", "features/planted/s.ts", '/* select * from custom.record; c.schema("custom") */\nexport const x = 1;'],
  ["knob key and door name in a sentence", "features/planted/t.ts", 'export const k = "custom.data_home_default_order"; export const e = new Error("custom.inbox_counts refused");'],
  ["another schema", "features/planted/u.ts", 'export const r = (c: any) => c.schema("communication" as never).rpc("x", {}, { schema: "public" });'],
  ["an unrelated custom-valued key", "features/planted/v.ts", 'const v = { state: "custom" }; export const o = { schema: v.state };'],
  ["a test file", "features/planted/__tests__/w.test.ts", 'c.schema("custom");'],
  ["a script", "scripts/planted-walk.mjs", 'c.schema("custom");'],
];

function selfTest(): void {
  // The plants are judged on top of the real tree, so the proof holds even while someone's new
  // file has the tree red; each assertion looks only at the planted path.
  const base = tree();
  for (const [label, file, text] of RED_PLANTS) {
    const planted = new Map(base);
    planted.set(file, text);
    if (!isAppSource(file)) throw new Error(`RED plant is outside the scanned app source — ${label}: ${file}`);
    const red = judge(planted).find((f) => f.file === file && f.kind === "new");
    if (!red) throw new Error(`RED plant did not fail — ${label}: ${file}`);
    console.log(`  RED   ${label} — [${red.kind}] ${red.file} (${touches(text).join(", ")})`);
  }
  for (const [label, file, text] of GREEN_PLANTS) {
    const planted = new Map(base);
    if (isAppSource(file)) planted.set(file, text);
    const hit = judge(planted).find((f) => f.file === file);
    if (hit) throw new Error(`GREEN plant was flagged — ${label}: ${hit.says}`);
    console.log(`  GREEN ${label} — not a touch`);
  }
  const first = Object.keys(TOUCHES_THE_STORE)[0];
  const moved = new Map(base);
  moved.set(first, 'import { createRecordsClient } from "@ai-matrx/records";\nexport const c = createRecordsClient;');
  const stale = judge(moved).find((f) => f.file === first && f.kind === "stale");
  if (!stale) throw new Error("a moved file did not fail as stale");
  console.log(`  RED   a moved allowlisted file — [stale] ${stale.file}`);
  console.log(`✓ self-test: ${RED_PLANTS.length} planted touches fail, ${GREEN_PLANTS.length} non-touches pass, a moved file fails as stale`);
}

// Run only as the entry point, so another census script can import `touches` and `isAppSource`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    selfTest();
  } else if (argv.includes("--list")) {
    for (const [file, text] of tree()) {
      if (isTest(file)) continue;
      const shapes = touches(text);
      if (shapes.length) console.log(`${file}\t${shapes.join(",")}`);
    }
  } else {
    const findings = judge(tree(argv.includes("--tracked-only")));
    if (findings.length) {
      console.log(`✗ ${findings.length} file(s) break "apps never write their own custom-data code":`);
      for (const f of findings) console.log(`    [${f.kind}] ${f.file} — ${f.says}`);
      process.exit(1);
    }
    console.log(`✓ no app file touches custom.* directly beyond the ${Object.keys(TOUCHES_THE_STORE).length} the census lists`);
  }
}
