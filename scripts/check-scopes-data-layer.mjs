#!/usr/bin/env node
// scripts/check-scopes-data-layer.mjs — THE SCOPES DATA LAYER IS THE PACKAGE.
//
// Scope data (types, scopes, context fields, values) is custom data, read and written ONLY through
// `scopeDoors()` (features/scopes/service/scopeDoors.ts → `@ai-matrx/records/scopes`). Fails on:
//   (a) a file under features/scopes or app/(core)/scopes that imports a supabase client or calls
//       `.rpc(` / `.schema(` / `.from(` — except the binding itself and the named non-scope readers
//       below (each with its reason; the list only shrinks);
//   (b) any app file naming a `custom.context_*` door string ("context_tree", "context_values", …) —
//       only the package may;
//   (c) any reader of the archived scope tables: a `"context"` schema read of scope_types / scopes /
//       context_items / context_item_values / context_value_refs / scope_dataset_instances, or a
//       `Database["deprecated"]` scope row type.
//
//   node scripts/check-scopes-data-layer.mjs              → exit 1 on any finding
//   node scripts/check-scopes-data-layer.mjs --self-test  → proves each rule fails on a planted file

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = ["app", "features", "components", "lib", "providers", "hooks", "utils"];
const CHOKEPOINT_DIRS = ["features/scopes/", "app/(core)/scopes/"];

/** The binding, and the non-scope reads that still live beside it (shrink-only). */
const CHOKEPOINT_ALLOW = new Map([
  ["features/scopes/service/scopeDoors.ts", "THE binding of the scope doors"],
  ["features/scopes/service/scopeDoors.server.ts", "the binding for server components"],
  ["app/(core)/scopes/s/[scopeId]/page.tsx", "the organization's slug for the canonical URL (iam.organizations)"],
  ["features/scopes/service/kindInventory.ts", "entity kind counts and reference candidates (not scope data)"],
  ["features/scopes/service/recordFacts.ts", "per-entity facts (not scope data)"],
  ["features/scopes/service/categoriesService.ts", "categories (not scope data)"],
  ["features/scopes/service/commentsService.ts", "comments (not scope data)"],
  ["features/scopes/service/entityRows.ts", "entity rows (not scope data)"],
  ["features/scopes/service/entityTitles.ts", "entity titles (not scope data)"],
  ["features/scopes/service/favoritesCore.ts", "favorites (not scope data)"],
  ["features/scopes/service/favoriteOverlay.ts", "favorites (not scope data)"],
  ["features/scopes/service/inChunks.ts", "the chunked-read helper (not scope data)"],
  ["features/scopes/host/associationsStore.ts", "the associations package host binding"],
  ["features/scopes/registry/entityRegistry.ts", "the entity registry's own row reads (not scope data)"],
  ["features/scopes/registry/entityContentAdapters.ts", "entity content reads (not scope data)"],
]);

const DOOR_STRING = /(?:\.rpc|Door\w*)\(\s*["'`]context_(tree|types|type_scopes|search|scopes|items|values|archived_types|system_items|templates|type_write|scope_write|item_write|value_write|type_archive|type_restore|scope_archive|scope_restore|item_archive|item_restore|tags_set|template_apply|template_define)["'`]/;
const ARCHIVED_TABLES = "scope_types|scopes|context_items|context_item_values|context_value_refs|scope_dataset_instances";
const ARCHIVED_READ = new RegExp(`schema\\(\\s*["']context["']\\s*\\)[\\s\\S]{0,80}?\\.from\\(\\s*["'](${ARCHIVED_TABLES})["']|["'](${ARCHIVED_TABLES})["'][^\\n]{0,120}["']context["']`);
const DEPRECATED_ROW = new RegExp(`Database\\[["']deprecated["']\\]\\[["']Tables["']\\]\\[["'](${ARCHIVED_TABLES})["']\\]`);
const SUPABASE_IMPORT = /from\s+["']@\/utils\/supabase\/(client|server)["']/;
const RAW_CALL = /\.(rpc|schema|from)\(/;

// (review 2) A scope field/value is HELD by the Redux holder only: a module-level Map/cache in a file
// that handles scope fields or values, outside features/scopes/redux/, is a second cache.
const MODULE_CACHE = /^(?:export\s+)?(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*new\s+(?:Map|WeakMap)\b/m;
const SCOPE_DATA = /\b(ContextField|ContextValue)\b|scopeDoors\(\)\.(fields|values)\(/;
// (review 6) A value's encoding (the door's value_* slots, the reference fence a write carries, the
// one write an edit becomes) is spoken only by @ai-matrx/records/scopes.
// (A reference fence for DISPLAY/EDITING — `referenceFence`, the picker's fence — is allowed; the
// write it becomes is the package's `contextValueWrite`.)
const VALUE_ENCODING = /\bvalue_(text|number|boolean|date|timestamp|time|json|document_url)\b|function\s+(contextValueWrite|referencesFromFence)\b/;

function isTest(path) {
  return /(__tests__|\.test\.|\.spec\.)/.test(path);
}

// (review r2-3) A holder thunk keeps no in-flight state of its own: identical door reads are sent once
// by the records client and the reducers are idempotent. Shrink-only allow-list: reads that do not go
// through the records client (projects / tasks services) keep their per-key promise.
const THUNK_IN_FLIGHT = /^(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*new\s+(?:Map|Set)<[^>]*Promise|^let\s+\w+\s*:\s*Promise</m;
const THUNK_IN_FLIGHT_ALLOW = new Map([
  ["features/scopes/redux/thunks/ensureOrphanProjects.ts", "projects service read (not the records client)"],
  ["features/scopes/redux/thunks/ensureScopeTasks.ts", "tasks service read (not the records client)"],
]);
// (review r2-3) A scope hook reads the holder; it never keeps a React-state copy of fields or values.
const HOOK_STATE_COPY = /useState<[^>]*\b(ContextField|ContextValue)\b(?!Kind)/;

export function findings(path, text) {
  const out = [];
  if (isTest(path)) return out;
  const inChokepoint = CHOKEPOINT_DIRS.some((d) => path.startsWith(d));
  if (inChokepoint && !CHOKEPOINT_ALLOW.has(path)) {
    if (SUPABASE_IMPORT.test(text)) out.push(`${path}: imports a supabase client — scope data goes through scopeDoors()`);
    else if (RAW_CALL.test(text.replace(/Array\.from\(|Object\.from|\.fromEntries\(|new Set\(|Map\(/g, ""))) {
      const line = text.split("\n").findIndex((l) => /(supabase|db|client|\))\s*\.(rpc|schema|from)\(/.test(l));
      if (line >= 0) out.push(`${path}:${line + 1}: calls .rpc/.schema/.from — scope data goes through scopeDoors()`);
    }
  }
  if (!path.startsWith("features/scopes/redux/") && MODULE_CACHE.test(text) && SCOPE_DATA.test(text)) {
    out.push(`${path}: keeps a module-level Map beside scope fields/values — the Redux holder is the one cache`);
  }
  if (path.startsWith("features/scopes/redux/thunks/") && !THUNK_IN_FLIGHT_ALLOW.has(path) && THUNK_IN_FLIGHT.test(text)) {
    out.push(`${path}: keeps module-level in-flight state — the records client dedupes reads; the holder is the state`);
  }
  if (path.startsWith("features/scopes/hooks/") && HOOK_STATE_COPY.test(text)) {
    out.push(`${path}: keeps a React-state copy of scope fields/values — read the holder's selectors`);
  }
  if (VALUE_ENCODING.test(text)) out.push(`${path}: encodes a scope value (value_* slot / fence write) — only @ai-matrx/records/scopes may`);
  if (DOOR_STRING.test(text)) out.push(`${path}: names a custom.context_* door — only @ai-matrx/records may`);
  if (ARCHIVED_READ.test(text)) out.push(`${path}: reads an archived scope table in "context" (moved to deprecated)`);
  if (DEPRECATED_ROW.test(text)) out.push(`${path}: types a row of an archived scope table (Database["deprecated"])`);
  return out;
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

function selfTest() {
  const cases = [
    ["features/scopes/redux/thunks/plant.ts", 'import { supabase } from "@/utils/supabase/client";\n', true],
    ["features/scopes/redux/thunks/plant2.ts", 'const r = await supabase.schema("custom").rpc("x", {});\n', true],
    ["features/tasks/plant.ts", 'await db.rpc("context_values", {});\n', true],
    ["features/admin/mock.ts", 'const m = { name: "context_items" };\n', false],
    ["features/item-presentation/plant.ts", 'fetchRow(s, "scope_types", id, "label", map, "context");\n', true],
    ["features/agent-context/plant.ts", 'type R = Database["deprecated"]["Tables"]["context_items"]["Row"];\n', true],
    ["features/scopes/service/scopeDoors.ts", 'import { supabase } from "@/utils/supabase/client";\n', false],
    ["features/scopes/components/plant-cache.ts", 'import type { ContextField } from "x";\nconst cache = new Map<string, ContextField[]>();\n', true],
    ["features/scopes/redux/holder-cache.ts", 'import type { ContextField } from "x";\nconst cache = new Map<string, ContextField[]>();\n', false],
    ["features/tasks/plant-value.ts", 'const payload = { value_text: fence };\n', true],
    ["features/scopes/utils/plant-write.ts", 'export function contextValueWrite(f, s, v) {}\n', true],
    ["features/scopes/redux/thunks/plant-flight.ts", 'const inFlight = new Map<string, Promise<void>>();\n', true],
    ["features/scopes/redux/thunks/plant-flight2.ts", 'let skeletonInFlight: Promise<void> | null = null;\n', true],
    ["features/scopes/redux/thunks/ensureScopeTasks.ts", 'const inFlight = new Map<string, Promise<void>>();\n', false],
    ["features/scopes/redux/thunks/clean-map.ts", 'const lastAnswered = new Map<string, string>();\n', false],
    ["features/scopes/hooks/plant-copy.ts", 'const [items, setItems] = useState<Record<string, ContextField[]>>({});\n', true],
    ["features/scopes/hooks/clean-kind.ts", 'const [kind, setKind] = useState<ContextFieldKind>("string");\n', false],
    ["features/scopes/redux/thunks/clean.ts", 'const r = await scopeDoors().tree(ids);\nArray.from(x);\n', false],
  ];
  let bad = 0;
  for (const [path, text, expectFail] of cases) {
    const got = findings(path, text).length > 0;
    console.log(`${got === expectFail ? "ok  " : "FAIL"} ${expectFail ? "red  " : "green"} ${path}`);
    if (got !== expectFail) bad++;
  }
  if (bad) {
    console.error(`self-test: ${bad} case(s) wrong`);
    process.exit(1);
  }
  console.log("self-test: every rule fails on its planted file and passes the clean ones");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const files = SCAN.flatMap((d) => walk(join(ROOT, d), []));
  const all = [];
  for (const full of files) all.push(...findings(relative(ROOT, full), readFileSync(full, "utf8")));
  for (const path of CHOKEPOINT_ALLOW.keys()) {
    try {
      statSync(join(ROOT, path));
    } catch {
      all.push(`${path}: allow-listed but gone — delete its row (the list only shrinks)`);
    }
  }
  if (all.length) {
    console.error(`scopes data layer: ${all.length} finding(s)\n` + all.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`scopes data layer: clean (${files.length} files)`);
}
