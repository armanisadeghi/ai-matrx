/**
 * @jest-environment node
 */
/**
 * THE STORE READ PATH EQUALS THE OLD PATH, READER BY READER, SEAT BY SEAT — ON THE DEV CLONE
 * (lane SCOPES-READ-SWITCH-VALIDATE, 2026-09-30).
 *
 * The web's scope reads have two paths behind `scopesReadFromStore()` (the knob `custom.scope_readers_read_the_store`):
 * the `context.*` tables (OFF, today) and the record store's `custom.context_*` doors (ON). Before
 * anybody flips it, every reader every scope screen calls must hand back the same thing on both
 * paths from the person's own seat. This suite signs in on the CLONE (never production) as
 * admin@admin.com and as test@test.com with the publishable key, runs every scopesService read the
 * screens use with the switch OFF and then ON, and diffs the answers value by value (names, dates,
 * file references, order, counts). Store clocks (created_at / updated_at / a value's set time) are
 * the store's own by ruling (SCOPES-CUTOVER-PLAN) and are compared separately, never silently.
 *
 * Read-only. Skipped unless the clone's URL + key (.env.clone.local) and both seats' credentials are
 * present (member: SEAT_PASSWORD in the environment — the raw AI_MEMBER_PASSWORD line of .env.local;
 * dotenv's parse of that line loses a character). The full diff lands at PARITY_OUT (JSON).
 *
 *   SEAT_PASSWORD=… PARITY_OUT=/tmp/…/parity.json pnpm jest features/scopes/service/__tests__/store-read-parity.clone.test.ts
 *
 * IT MEASURES OR IT FAILS (lane SCOPES-ON-THE-STORE M2, 2026-10-02). On clone-20261001 this suite
 * "passed" with both paths answering 0 organizations for both seats: it asserted nothing
 * (`expect(true)`), a read that failed the same way on both paths was counted as agreement, and a
 * failed tree read became an empty tree (`data ?? []`). Now, per seat:
 *   1. "measures her tree" — the tree loads on both paths, the seat belongs to at least one
 *      organization and sees at least one scope on the old path, and no reader failed on either path.
 *      Anything else is UNMEASURED and fails with a plain sentence.
 *   2. "store equals old" — zero real differences (what reaches a screen; see below), every reader.
 * Each seat runs on freshly loaded modules (jest.resetModules), so no module cache — the membership
 * read caches for 4 s by container type alone — can hand one seat the other's organizations.
 *
 * The guard's own proof: PARITY_PLANT=empty-memberships makes `mbr_for_user` answer no rows on both
 * paths (in memory, through the client this suite owns — no file and no row is touched); test 1 must
 * go RED for both seats. PARITY_PLANT=memberships-fail makes it fail on both paths; RED too.
 *
 * IT COMPARES WHAT REACHES A SCREEN (lane SCOPES-ON-THE-STORE O7, 2026-10-02). Every field is compared,
 * except the declared list below — each one a field no screen and no web agent path reads (grep
 * evidence beside it) — and three normalizations, each tied to how the screens read the value:
 *   - a ```matrx reference fence is compared by what the screens parse out of it
 *     (`parseReferenceCellValue`: its type and its items — ids, file ids, labels, in order), never by
 *     its bytes (indentation, key order, the legacy `__kind` shell);
 *   - a key the OLD path does not select at all, answered `null` by the store, is the same empty cell;
 *   - a list the screens draw in `sort_order` (scope types, context items) must come from the store in
 *     `sort_order`; the old path names no order there (no ORDER BY, by id, or ties in heap order).
 * A value list (`values`) is never drawn in its own order: every screen joins it to the items by
 * `context_item_id` (contextValuesSlice, useScopeTypeTables, ContextInspector, resolveSuggestionTarget).
 * Each excluded or normalized difference is still counted and written to PARITY_OUT; only real ones fail.
 * The harness refuses (UNMEASURED) a seat that compared no value cell — exclusions never make it vacuous.
 * Plants proving the comparison still bites (in memory, through the suite's own client — no file, no
 * row): PARITY_PLANT=value-text (the store answers every text value with a word added), fence-label
 * (every reference label the store names is renamed), type-order (the store answers each organization's
 * scope types reversed). Each must go RED on test 2, naming the planted class.
 * PARITY_SEATS=member (or admin) runs one seat.
 *
 * COMPARED AGAINST THE RULED BEHAVIOUR, NOT THE OLD PATH (lane SCOPES-ON-THE-STORE, chair rulings of
 * 2026-10-02 13:20 PT, and the O7 classes judged store-right in
 * common-docs/projects/data-doctrine-adoption/v6/scopes-evidence/scopes-o7-value-diffs.md). Where the
 * ruling says the store is right, the store's answer is held to the ruled rule — each a narrow match
 * (one field, one condition, its evidence beside it), never a field ignored:
 *   - ruling 2: a value's `version` is the version a PERSON made. Both paths now answer that (the old
 *     row counts person writes; custom.context_values answers the source's old_version) — compared exactly.
 *   - ruling 3: `fetch_hint` is one of the store's three words; the old read now names "lazy" as
 *     "on_demand" (scopesService withStoreFetchHints) — compared exactly.
 *   - ruling 4: `archived_scope_count` is what the data home's archive (custom.read_records_archived)
 *     shows THIS seat for that type — the oracle is that door, asked here per type (`ruled-archived-count`).
 *   - ruling 1: a system write must never drop a reference to an archived scope — the OLD path is right.
 *     The one reference already dropped on the clone (RULING_1_PENDING) is named and counted apart
 *     (`ruled-pending-restore`); any other dropped reference is a real difference.
 *   - O7 #6/#7/#8 (`ruled-label`): a reference item's LABEL where ids, types and order are equal and the
 *     store's label is the live one — the old fence carried none, a workbook's "Imported from <name>.<ext>",
 *     or the store's read-mask redaction of a record the seat may not open. Any other label change is real.
 *   - O7 #11 (`cleared-cell`): an old current row whose every value column is NULL (a cleared cell) that
 *     the store keeps no key for — the missing row and the list length it accounts for, nothing else.
 *   - O7 #5 (`fence-spelling`): unchanged (above).
 *   - SCOPES-D1 (`whole-value-unread-here`): a text kept as a file the node suite cannot open (no bearer for
 *     the file service); the cell says so. NOT measured by this suite — named apart, see diff().
 * The plants still bite through every one: value-text changes plain text (no rule touches it),
 * fence-label renames every label to "Planted Name" (none of the three label conditions holds).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envFile(rel: string): Record<string, string> {
  const file = path.resolve(__dirname, rel);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
const LOCAL = envFile("../../../../.env.local");
const CLONE = envFile("../../../../.env.clone.local");
const URL_ = CLONE.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = CLONE.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const ONLY_SEATS = (process.env.PARITY_SEATS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SEATS = [
  { seat: "admin", email: LOCAL.AI_ADMIN_USERNAME ?? "", password: LOCAL.AI_ADMIN_PASSWORD ?? "" },
  { seat: "member", email: "test@test.com", password: process.env.SEAT_PASSWORD ?? "" },
].filter((s) => ONLY_SEATS.length === 0 || ONLY_SEATS.includes(s.seat));
if (SEATS.length === 0) throw new Error(`PARITY_SEATS=${ONLY_SEATS.join(",")} names no seat this suite knows (admin, member).`);
const READY = Boolean(URL_ && KEY && /nwvv|supabase\.co/.test(URL_) && !/matrxserver/.test(URL_) && SEATS.every((s) => s.email && s.password));
const describeClone = READY ? describe : describe.skip;
const PLANT = process.env.PARITY_PLANT ?? "";
const STORE_PLANTS = ["value-text", "fence-label", "type-order"];
if (PLANT && !["empty-memberships", "memberships-fail", ...STORE_PLANTS].includes(PLANT)) throw new Error(`PARITY_PLANT=${PLANT} is not a plant this suite knows.`);

/**
 * THE STORE-SIDE PLANTS (proof that what is compared still bites): a store door's answer is changed in
 * memory, after the database answered and before the adapter reads it. Only the doors named here.
 */
type DoorAnswer = { data: unknown; error: unknown };
function plantStoreAnswer(door: string, res: DoorAnswer): DoorAnswer {
  if (res.error || res.data == null) return res;
  if (PLANT === "value-text" && door === "context_values" && Array.isArray(res.data)) {
    // A text value the person typed comes back with a word added: what a screen prints changes.
    return {
      ...res,
      data: (res.data as Array<Record<string, unknown>>).map((row) => {
        const field = (row.field ?? {}) as { type?: string };
        const v = row.value;
        return typeof v === "string" && !v.startsWith("```") && field.type !== "relation" ? { ...row, value: `${v} (planted)` } : row;
      }),
    };
  }
  if (PLANT === "fence-label" && door === "context_values" && Array.isArray(res.data)) {
    // Every name the store gives a referenced scope is a different name: the chip's text changes.
    return {
      ...res,
      data: (res.data as Array<Record<string, unknown>>).map((row) => {
        const labels = row.labels as Record<string, string> | null | undefined;
        if (!labels || Object.keys(labels).length === 0) return row;
        return { ...row, labels: Object.fromEntries(Object.keys(labels).map((k) => [k, "Planted Name"])) };
      }),
    };
  }
  if (PLANT === "type-order" && door === "context_tree" && typeof res.data === "object") {
    // The tree's scope types come back reversed: EntityScopeTagger draws them in this order.
    const tree = res.data as { types?: unknown[] };
    return { ...res, data: { ...tree, types: [...(tree.types ?? [])].reverse() } };
  }
  return res;
}
function plantedSchema(schemaClient: unknown): unknown {
  const sc = schemaClient as Record<string | symbol, unknown>;
  return new Proxy(sc, {
    get: (t, prop) => {
      const v = t[prop];
      if (prop === "rpc") {
        return (fn: string, args?: unknown, opts?: unknown) => {
          const q = (v as (...a: unknown[]) => PromiseLike<DoorAnswer>).call(t, fn, args, opts);
          return Promise.resolve(q).then((r) => plantStoreAnswer(fn, r));
        };
      }
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

// The one client every module under test reads through, swapped per seat.
// One client for both seats (signed out and in again between them): modules read `supabase.auth` at load.
const holder: { client: SupabaseClient | null; userId: string | null } = {
  client: READY ? createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null,
  userId: null,
};
jest.mock("@/utils/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) => {
        const c = holder.client as unknown as Record<string | symbol, unknown>;
        // THE PLANT (proof of the zero-organization guard): the membership read answers nothing, or
        // fails, on BOTH paths. In memory only.
        if (prop === "schema" && STORE_PLANTS.includes(PLANT)) {
          // Only the store's own schema: the old path's `context.*` reads are never touched.
          return (name: string) => {
            const sc = (c.schema as (n: string) => unknown).call(c, name);
            return name === "custom" ? plantedSchema(sc) : sc;
          };
        }
        if (prop === "rpc" && PLANT && !STORE_PLANTS.includes(PLANT)) {
          return (fn: string, args?: unknown, opts?: unknown) => {
            if (fn !== "mbr_for_user") return (c.rpc as (...a: unknown[]) => unknown).call(c, fn, args, opts);
            if (PLANT === "empty-memberships") return Promise.resolve({ data: [], error: null, count: null, status: 200, statusText: "OK" });
            return Promise.resolve({ data: null, error: { message: "planted: the membership read failed", code: "P0001", details: "", hint: "" }, count: null, status: 400, statusText: "Bad Request" });
          };
        }
        const v = c[prop];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
      },
    },
  ),
}));
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => holder.userId,
  requireUserId: () => {
    if (!holder.userId) throw new Error("no user");
    return holder.userId;
  },
  getUserEmail: () => null,
  requireUser: () => ({ id: holder.userId, email: null }),
}));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false, isAdminLanePath: () => false }));

// Loaded per seat, on fresh modules (the modules read `supabase.auth` at load, and the membership
// read keeps a 4 s cache keyed by container type alone — never shared between two seats).
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
let scopesService: any = null;
let __setScopesReadFromStoreForTests: (v: boolean | null) => void = () => undefined;
// The screens' own reader of a reference cell (ContextValueDisplay, summarizeContextCell) — not the SUT.
// Loaded with the modules (it imports the service, which reads the mocked client at load).
let parseReferenceCellValue: (t: string | null | undefined) => { type: string; items: unknown[] } | null = () => null;
function loadFreshModules() {
  jest.resetModules();
  parseReferenceCellValue = require("@/features/scopes/utils/referenceCell").parseReferenceCellValue;
  scopesService = require("@/features/scopes/service/scopesService").scopesService;
  __setScopesReadFromStoreForTests = require("@/features/scopes/service/scopesReadKnob").__setScopesReadFromStoreForTests;
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

type TreeCount = { orgs: number; types: number; scopes: number };
type Failure = { reader: string; arg: string; old: unknown; store: unknown };

/**
 * The refusal: a seat's run measured something, or it fails with a sentence saying why not.
 * Returns null when measured.
 */
function unmeasured(seat: string, t: { oldOk: boolean; storeOk: boolean; oldError?: unknown; storeError?: unknown; old: TreeCount; store: TreeCount }, failures: Failure[]): string | null {
  if (!t.oldOk || !t.storeOk) {
    const which = !t.oldOk && !t.storeOk ? "either path" : !t.oldOk ? "the old path" : "the store path";
    return `UNMEASURED: ${seat}'s scope tree did not load on ${which} (${JSON.stringify(!t.oldOk ? t.oldError : t.storeError)}) — a failed read is not an empty tree, so nothing was compared.`;
  }
  if (t.old.orgs === 0 || t.store.orgs === 0) {
    return `UNMEASURED: ${seat} belongs to ${t.old.orgs} organizations on the old path and ${t.store.orgs} on the store path — with none, nothing was compared; check that her memberships read on this clone.`;
  }
  if (t.old.scopes === 0) {
    return `UNMEASURED: ${seat} sees ${t.old.orgs} organizations but 0 scopes on the old path — nothing was compared.`;
  }
  if (failures.length > 0) {
    return `UNMEASURED: ${failures.length} reader call(s) failed for ${seat} (first: ${failures[0]!.reader} ${failures[0]!.arg} — old ${JSON.stringify(failures[0]!.old)}, store ${JSON.stringify(failures[0]!.store)}).`;
  }
  return null;
}

// Keys the store answers from its own clock, by ruling — compared, reported apart, never a defect.
const CLOCK_KEYS = new Set(["created_at", "updated_at", "fetched_at", "status_updated_at", "last_fed_at"]);

/**
 * BOOKKEEPING — fields NO screen and no web agent path reads (lane SCOPES-ON-THE-STORE O7, 2026-10-02).
 * Each was traced from the service to every reader: features/scopes, features/scope-system, the chat
 * lens and context inspector (packages/chat/src/agents/components/context-items, context-preview),
 * ContextAssignmentField, ActiveContextTree, EntityScopeTagger, the org scopes page, kg-suggestions,
 * surfaces manifests. A difference here is counted and written out, never failed. Never widen a row:
 * a field earns a row only with its grep evidence.
 */
const BOOKKEEPING: Array<{ readers: RegExp; path: RegExp; why: string }> = [
  {
    // `rg -n "item\??\.version|it\.version"` over features/ packages/chat/src components/ app/: no scope
    // reader; the only `.version` reads in features/scopes + scope-system are a VALUE's (EditScopeValueSheet
    // "v{row.version}", ContextValueRow, scopeContextView) — values stay compared.
    readers: /^listContextItems(ForTypes)?$/,
    path: /^\.items\[[^\]]+\]\.version$/,
    why: "a context item's version: no screen or agent reads it (the store's Field edit counter)",
  },
  {
    // `rg -n "updated_by" features/scopes features/scope-system packages/chat/src/agents/components`:
    // only the adapter's own `updated_by: null` and test fixtures.
    readers: /^listContextItems(ForTypes)?$/,
    path: /^\.items\[[^\]]+\]\.updated_by$/,
    why: "a context item's updated_by: no screen or agent reads it",
  },
  {
    // `rg -n "authored_by"` (minus migrations, generated types, tests): the service's selects, the
    // adapter, the type, and setContextValue's optimistic `authored_by: null` — a writer, never a reader.
    readers: /^(listContextValues|listContextValuesForScopes|resolveContextCell)$/,
    path: /^(\.values\[[^\]]+\]|\.value)\.authored_by$/,
    why: "a value's authored_by: no screen or agent reads it",
  },
];

/** The lists the screens draw in `sort_order` (stable sorts; EntityScopeTagger draws the tree's types as answered). */
const SORT_ORDER_LISTS = new Set(["scope_types", "items"]);
/** The lists no screen draws in their own order: every reader joins values to items by context_item_id. */
const UNORDERED_LISTS = new Set(["values"]);

type DiffKind =
  | "value" | "clock" | "bookkeeping" | "fence-spelling" | "screen-order" | "value-list-order" | "absent-vs-null"
  | "ruled-label" | "cleared-cell" | "ruled-archived-count" | "ruled-pending-restore" | "whole-value-unread-here";

/**
 * RULING 1's ONE KNOWN DROP (clone, 2026-10-02): Castellano & Reyes' "Workers' Compensation" scope
 * (5f7a90b5…), team_members (old value ab9a65bb…), lost Nadia Brandt (726ac9e6…, archived 2026-09-28
 * 19:50:11Z) to the copy's correction (src s5, 19:55:10Z). The old path is right; the store's data
 * still lacks her, and the mover fix (aidream 05174769f1) keeps a held archived reference but cannot
 * put back one already dropped. Matched only as: the same type, the store's items are the old items
 * with exactly this one id removed. Anything else missing from a reference is a real difference.
 */
const RULING_1_PENDING = new Set(["726ac9e6-8430-4174-9fb2-72c41559172a"]);

/** O7 #8: the store's read mask names a record the seat may not open in these words (custom.read_mask). */
const REDACTED_LABEL = "A record you have not been given access to";

/** O7 #11: the columns an old value row holds its value in — all NULL is a cleared cell. */
const OLD_VALUE_COLUMNS = [
  "value_text", "value_number", "value_boolean", "value_json", "value_date",
  "value_document_url", "value_timestamp", "value_time", "value_reference_id",
];
function clearedOldCell(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return typeof o.context_item_id === "string" && OLD_VALUE_COLUMNS.every((k) => o[k] == null);
}

/**
 * Two reference fences that differ in meaning: does the difference fall under a ruled class?
 * `ruled-pending-restore` (ruling 1's known drop) or `ruled-label` (O7 #6/#7/#8), else null (real).
 */
function ruledFenceKind(fa: string, fb: string, liveNames: Array<{ type: string; id: string; label: string }>): DiffKind | null {
  const a = JSON.parse(fa) as { type: string; items: Array<Record<string, unknown>> };
  const b = JSON.parse(fb) as { type: string; items: Array<Record<string, unknown>> };
  if (a.type !== b.type) return null;
  const idOf = (it: Record<string, unknown>) => String(it.id ?? it.file_id ?? it.table_id ?? "").toLowerCase();
  // Ruling 1: exactly the known archived target missing, every other item identical.
  const dropped = a.items.filter((it) => !b.items.some((x) => idOf(x) === idOf(it)));
  if (dropped.length > 0) {
    const kept = a.items.filter((it) => !dropped.includes(it));
    const same = kept.length === b.items.length && kept.every((it, i) => JSON.stringify(it) === JSON.stringify(b.items[i]));
    return same && dropped.every((it) => RULING_1_PENDING.has(idOf(it))) ? "ruled-pending-restore" : null;
  }
  if (a.items.length !== b.items.length) return null;
  let labelled = false;
  for (let i = 0; i < a.items.length; i += 1) {
    const x = a.items[i]!;
    const y = b.items[i]!;
    const rest = (o: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== "label")));
    if (rest(x) !== rest(y)) return null;
    const la = typeof x.label === "string" ? x.label : "";
    const lb = typeof y.label === "string" ? y.label : "";
    if (la === lb) continue;
    const imported = /^Imported from (.+?)(\.[A-Za-z0-9]{1,5})?$/.exec(la);
    const ok =
      (la === "" && lb !== "" && (liveNames.push({ type: a.type, id: idOf(y), label: lb }), true)) || // #6: id-only old fence; the store's live name (checked after the run)
      lb === REDACTED_LABEL || // #8: the store's mask redacts a record this seat may not open
      (imported !== null && imported[1] === lb); // #7: a workbook's import caption → its live name
    if (!ok) return null;
    labelled = true;
  }
  return labelled ? "ruled-label" : null;
}
type Diff = {
  reader: string; arg: string; path: string; old: unknown; store: unknown; kind: DiffKind; clock: boolean;
  /** O7 #6: the live names a `ruled-label` claims; held to an oracle after the run (never trusted as-is). */
  liveNames?: Array<{ type: string; id: string; label: string }>;
};
type Stats = { leaves: number; valueCells: number };

function strip(v: unknown): unknown {
  return v;
}

function bookkeeping(reader: string, p: string): boolean {
  return BOOKKEEPING.some((b) => b.readers.test(reader) && b.path.test(p));
}

/** A reference fence, as the screens read it (`parseReferenceCellValue`), with each item's keys in one order. */
function fenceMeaning(text: string): string | null {
  const parsed = parseReferenceCellValue(text);
  if (!parsed) return null;
  const items = parsed.items.map((it) => {
    const o = it as unknown as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  });
  return JSON.stringify({ type: parsed.type, items });
}

function push(out: Diff[], d: Omit<Diff, "clock">) {
  out.push({ ...d, clock: d.kind === "clock" });
}

function diff(reader: string, arg: string, a: unknown, b: unknown, p: string, out: Diff[], stats: Stats) {
  if (/\.values\[[^\]]+\]$/.test(p) && a && b && typeof a === "object" && typeof b === "object") stats.valueCells += 1;
  if (Object.is(a, b)) {
    if (a === null || typeof a !== "object") stats.leaves += 1;
    return;
  }
  const key = p.split(".").pop()?.replace(/\[[^\]]+\]$/, "") ?? "";
  if (Array.isArray(a) && Array.isArray(b)) {
    // Align lists of rows by id where they have one, so an order difference is named as such.
    const ids = (x: unknown[]) => x.map((e) => (e && typeof e === "object" && "id" in (e as object) ? String((e as { id: unknown }).id) : null));
    const ai = ids(a);
    const bi = ids(b);
    if (a.length !== b.length) {
      // O7 #11: the length is accounted for only when the old-only rows are exactly the cleared cells.
      const bset = new Set(bi);
      const oldOnly = a.filter((_, i) => ai[i] !== null && !bset.has(ai[i]));
      const cleared = key === "values" && b.length < a.length && oldOnly.length === a.length - b.length && oldOnly.every(clearedOldCell);
      push(out, { reader, arg, path: `${p}.length`, old: a.length, store: b.length, kind: cleared ? "cleared-cell" : "value" });
    }
    if (ai.every((x) => x) && bi.every((x) => x)) {
      if (ai.join() !== bi.join() && [...ai].sort().join() === [...bi].sort().join()) {
        // The order a screen shows: a value list not at all; a sort_order list must come from the
        // store in sort_order (per scope type) — the order the people who arranged it set, and the
        // order ActiveContextTree / the quick pick / EntityScopeTagger draw as answered. The old path
        // names no order there to keep (listContextItems: no ORDER BY; ForTypes: by id; scope types:
        // ORDER BY sort_order alone, ties in heap order), and every element's sort_order is compared
        // as a field. Anything else: exactly.
        const inSortOrder = (x: unknown[]) => {
          const last = new Map<string, number>();
          for (const e of x) {
            const o = e as { sort_order?: unknown; scope_type_id?: unknown };
            if (typeof o.sort_order !== "number") return false;
            const g = String(o.scope_type_id ?? "");
            if ((last.get(g) ?? -Infinity) > o.sort_order) return false;
            last.set(g, o.sort_order);
          }
          return true;
        };
        const kind: DiffKind = UNORDERED_LISTS.has(key)
          ? "value-list-order"
          : SORT_ORDER_LISTS.has(key) && inSortOrder(b)
            ? "screen-order"
            : "value";
        push(out, { reader, arg, path: `${p}#order`, old: ai.slice(0, 12), store: bi.slice(0, 12), kind });
      }
      const bm = new Map(b.map((e, i) => [bi[i]!, e]));
      const am = new Map(a.map((e, i) => [ai[i]!, e]));
      for (const [id, e] of am) {
        if (!bm.has(id)) push(out, { reader, arg, path: `${p}[${id}]`, old: summary(e), store: "(missing)", kind: key === "values" && clearedOldCell(e) ? "cleared-cell" : "value" });
        else diff(reader, arg, e, bm.get(id), `${p}[${id}]`, out, stats);
      }
      for (const [id, e] of bm) if (!am.has(id)) push(out, { reader, arg, path: `${p}[${id}]`, old: "(missing)", store: summary(e), kind: "value" });
      return;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff(reader, arg, a[i], b[i], `${p}[${i}]`, out, stats);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    // A TEXT KEPT AS A FILE THIS SUITE CANNOT OPEN (SCOPES-D1). The store cell holds the first words and
    // the screen reads the whole text through the file reader (readFileText → the Python file service,
    // which this node suite reaches with no bearer: "authentication required"). The cell then says so
    // (`value_incomplete`) instead of passing the first words off as the value. Not measured HERE, so it
    // is named apart, never counted as agreement — and matched only when the store's words are exactly the
    // old text's first words and the pointer names the old text's whole length.
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const inc = bo.value_incomplete as { head?: unknown; chars?: unknown; file_id?: unknown } | null | undefined;
    if (
      inc && typeof inc.head === "string" && typeof inc.file_id === "string" && ao.value_incomplete == null &&
      typeof ao.value_text === "string" && ao.value_text.length > inc.head.length &&
      ao.value_text.startsWith(inc.head) && [...ao.value_text].length === inc.chars
    ) {
      push(out, { reader, arg, path: `${p}.value_text`, old: `${[...ao.value_text].length} chars`, store: `first ${inc.head.length} + file ${inc.file_id}`, kind: "whole-value-unread-here" });
      const rest = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "value_text" && k !== "value_incomplete"));
      stats.valueCells -= 1; // the recursion below counts this same cell again
      diff(reader, arg, rest(ao), rest(bo), p, out, stats);
      return;
    }
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) diff(reader, arg, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${p}.${k}`, out, stats);
    return;
  }
  stats.leaves += 1;
  let kind: DiffKind = CLOCK_KEYS.has(key) ? "clock" : bookkeeping(reader, p) ? "bookkeeping" : "value";
  // The old path never selected this column; the store answers it empty. Same empty cell on screen.
  // (Only that direction: a store that drops a column the old path answered stays a difference.)
  if (kind === "value" && a === undefined && b === null) kind = "absent-vs-null";
  // A reference fence: what the screens parse out of it, not its bytes.
  if (kind === "value" && key === "value_text" && typeof a === "string" && typeof b === "string") {
    const fa = fenceMeaning(a);
    const fb = fenceMeaning(b);
    if (fa !== null && fb !== null) {
      if (fa === fb) kind = "fence-spelling";
      else {
        const liveNames: Array<{ type: string; id: string; label: string }> = [];
        const ruled = ruledFenceKind(fa, fb, liveNames);
        out.push({ reader, arg, path: p, old: JSON.parse(fa), store: JSON.parse(fb), kind: ruled ?? "value", clock: false, ...(ruled && liveNames.length ? { liveNames } : {}) });
        return;
      }
    }
  }
  push(out, { reader, arg, path: p, old: strip(a), store: strip(b), kind });
}

function summary(e: unknown): unknown {
  if (!e || typeof e !== "object") return e;
  const o = e as Record<string, unknown>;
  return { id: o.id, name: o.name ?? o.label_plural ?? o.key ?? o.display_name, context_item_id: o.context_item_id };
}

async function both<T>(fn: () => Promise<T>): Promise<{ old: T; store: T; oldMs: number; storeMs: number }> {
  __setScopesReadFromStoreForTests(false);
  let t = Date.now();
  const old = await fn();
  const oldMs = Date.now() - t;
  __setScopesReadFromStoreForTests(true);
  t = Date.now();
  const store = await fn();
  const storeMs = Date.now() - t;
  __setScopesReadFromStoreForTests(null);
  return { old, store, oldMs, storeMs };
}

const REPORT: Record<string, unknown> = { url_ref: URL_.replace(/^https:\/\/([a-z]+)\..*$/, "$1"), plant: PLANT || null, seats: {} };
const VERDICT: Record<string, { refusal: string | null; valueDiffs: number; byReader: Record<string, { value: number; clock: number }>; byClass: Record<string, number> }> = {};

/** A difference's class: its reader and its path with every row id folded (`.values[].value_text`). */
function classOf(d: Diff): string {
  return `${d.reader} ${d.path.replace(/\[[^\]]+\]/g, "[]")}`;
}

describeClone("the store read path equals the old path on the clone", () => {
  jest.setTimeout(1_800_000);

  for (const s of SEATS) {
    it(`${s.seat}: measures her tree on both paths (refuses 0 organizations, 0 scopes, a failed read)`, async () => {
      loadFreshModules();
      const client = holder.client!;
      const { data: auth, error } = await client.auth.signInWithPassword({ email: s.email, password: s.password });
      if (error || !auth.user) throw new Error(`${s.seat} could not sign in on the clone: ${error?.message}`);
      holder.userId = auth.user.id;

      const diffs: Diff[] = [];
      const stats: Stats = { leaves: 0, valueCells: 0 };
      const timings: Record<string, { old: number; store: number; calls: number }> = {};
      const errors: Failure[] = [];
      const run = async <T,>(reader: string, arg: string, fn: () => Promise<T>) => {
        const r = await both(fn);
        const tm = (timings[reader] ??= { old: 0, store: 0, calls: 0 });
        tm.old += r.oldMs;
        tm.store += r.storeMs;
        tm.calls += 1;
        const o = r.old as { ok?: boolean; error?: unknown; data?: unknown };
        const st = r.store as { ok?: boolean; error?: unknown; data?: unknown };
        // A failure on EITHER path is recorded — the same failure on both is not agreement.
        if (o?.ok === false || st?.ok === false) {
          errors.push({ reader, arg, old: o?.ok === false ? o.error : "ok", store: st?.ok === false ? st.error : "ok" });
          return r;
        }
        diff(reader, arg, o?.data ?? r.old, st?.data ?? r.store, "", diffs, stats);
        return r;
      };

      // 1. The boot tree — /scopes home, the chat lens tree, ActiveContextTree, ContextAssignmentField,
      //    EntityScopeTagger, the org scopes list (all draw from this one tree in Redux).
      const tree = await run("getScopeTree", "-", () => scopesService.getScopeTree());
      const treeOld = tree.old as { ok?: boolean; error?: unknown };
      const treeStore = tree.store as { ok?: boolean; error?: unknown };
      const oldOrgs = (tree.old as { data?: { organizations: Array<{ id: string; name: string; scope_types: Array<{ id: string; scopes: Array<{ id: string }> }> }> } }).data?.organizations ?? [];
      const storeOrgs = (tree.store as typeof tree.old as { data?: { organizations: typeof oldOrgs } }).data?.organizations ?? [];
      const count = (orgs: typeof oldOrgs) => ({
        orgs: orgs.length,
        types: orgs.reduce((n, o) => n + o.scope_types.length, 0),
        scopes: orgs.reduce((n, o) => n + o.scope_types.reduce((m, t) => m + t.scopes.length, 0), 0),
      });

      // 2. /scopes/templates.
      await run("listTemplates", "active", () => scopesService.listTemplates(true));
      await run("listSystemContextItems", "-", () => scopesService.listSystemContextItems());

      // 3. Per organization: its scopes list, its archived types, each type page, each type's items.
      const allScopes: string[] = [];
      const allTypes: string[] = [];
      for (const org of oldOrgs) {
        await run("listScopeTypesForOrganization", org.name, () => scopesService.listScopeTypesForOrganization(org.id));
        await run("listArchivedScopeTypes", org.name, () => scopesService.listArchivedScopeTypes(org.id));
        for (const t of org.scope_types) {
          allTypes.push(t.id);
          await run("listScopesOfType", `${org.name}/${t.id}`, () => scopesService.listScopesOfType(org.id, t.id));
          await run("listContextItems", `${org.name}/${t.id}`, () => scopesService.listContextItems(t.id));
          for (const sc of t.scopes) allScopes.push(sc.id);
        }
      }
      // 4. Every scope page's values (the hub reads them in batches; the page per scope).
      for (let i = 0; i < allScopes.length; i += 150) {
        const batch = allScopes.slice(i, i + 150);
        await run("listContextValuesForScopes", `batch ${i}`, () => scopesService.listContextValuesForScopes(batch));
      }
      // 5. A sample of single-scope pages: the home, the page's values, one cell, the suggestion target.
      const sample = allScopes.filter((_, i) => i % Math.max(1, Math.floor(allScopes.length / 60)) === 0);
      for (const id of [...new Set([...sample, "2f658029-7960-4fd5-a451-1e47c40a4746"])]) {
        await run("getScopeHome", id, () => scopesService.getScopeHome(id));
        const vals = await run("listContextValues", id, () => scopesService.listContextValues(id));
        const first = ((vals.old as { data?: { values: Array<{ context_item_id: string }> } }).data?.values ?? [])[0];
        if (first) {
          await run("resolveContextCell", `${id}/${first.context_item_id}`, () => scopesService.resolveContextCell({ scopeId: id, contextItemId: first.context_item_id }));
          await run("resolveSuggestionTarget", `${id}/${first.context_item_id}`, () => scopesService.resolveSuggestionTarget({ scopeId: id, contextItemId: first.context_item_id }));
        }
      }
      await run("listContextItemsForTypes", "all", () => scopesService.listContextItemsForTypes(allTypes));

      // RULING 4: archived_scope_count is held to the data home's archive for THIS seat — the oracle is
      // custom.read_records_archived itself, asked per type, never the door under test.
      const orgIdByName = new Map(oldOrgs.map((o) => [o.name, o.id]));
      for (const d of diffs) {
        const m = /\[([0-9a-f-]{36})\]\.archived_scope_count$/.exec(d.path);
        if (d.kind !== "value" || d.reader !== "listArchivedScopeTypes" || !m) continue;
        const orgId = orgIdByName.get(d.arg);
        if (!orgId) continue;
        const { data: rows, error: e } = await client
          .schema("custom")
          .rpc("read_records_archived", { p_organization_id: orgId, p_table_id: m[1], p_lane: "org", p_by_id: false, p_limit: 1000, p_offset: 0 });
        if (!e && Array.isArray(rows) && rows.length === d.store) d.kind = "ruled-archived-count";
      }

      // O7 #6: a live name the store added must BE the live name — the oracle is the OLD path's own tree
      // for a scope (context.scopes, the seat's RLS) and files.files for a file, never the store.
      const oldScopeName = new Map<string, string>();
      for (const o of oldOrgs) for (const t of o.scope_types) for (const sc of t.scopes as Array<{ id: string; name?: string }>) if (sc.name) oldScopeName.set(sc.id.toLowerCase(), sc.name);
      const fileIds = [...new Set(diffs.flatMap((d) => (d.liveNames ?? []).filter((n) => n.type === "file").map((n) => n.id)))];
      const fileName = new Map<string, string>();
      if (fileIds.length) {
        const { data: files } = await client.schema("files").from("files").select("id, file_name").in("id", fileIds);
        for (const f of (files ?? []) as Array<{ id: string; file_name: string | null }>) if (f.file_name) fileName.set(f.id.toLowerCase(), f.file_name);
      }
      for (const d of diffs) {
        if (d.kind !== "ruled-label" || !d.liveNames) continue;
        const truthful = d.liveNames.every((n) => (n.type === "file" ? fileName.get(n.id) : n.type === "scope" ? oldScopeName.get(n.id) : undefined) === n.label);
        if (!truthful) d.kind = "value";
      }

      // Only a real difference counts as `value`; every other kind is counted apart, never failed.
      const byReader: Record<string, { value: number; clock: number }> = {};
      const byKind: Record<string, number> = {};
      const byClass: Record<string, number> = {};
      for (const d of diffs) {
        byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
        const r = (byReader[d.reader] ??= { value: 0, clock: 0 });
        if (d.kind === "clock") r.clock += 1;
        else if (d.kind === "value") {
          r.value += 1;
          byClass[classOf(d)] = (byClass[classOf(d)] ?? 0) + 1;
        }
      }
      const real = diffs.filter((d) => d.kind === "value");
      const treeErrorsExcluded = errors.filter((e) => e.reader !== "getScopeTree");
      const refusal = unmeasured(
        s.seat,
        { oldOk: treeOld?.ok !== false, storeOk: treeStore?.ok !== false, oldError: treeOld?.error, storeError: treeStore?.error, old: count(oldOrgs), store: count(storeOrgs) },
        treeErrorsExcluded,
      ) ?? (stats.valueCells === 0
        ? `UNMEASURED: no value cell was compared for ${s.seat} (${stats.leaves} fields compared) — with none, "no difference" says nothing.`
        : null);
      VERDICT[s.seat] = { refusal, valueDiffs: real.length, byReader, byClass };
      (REPORT.seats as Record<string, unknown>)[s.seat] = {
        user: holder.userId,
        refusal,
        tree: { old: count(oldOrgs), store: count(storeOrgs) },
        timings,
        errors,
        compared: stats,
        byKind,
        byClass,
        byReader,
        diffs: real,
        // Excluded or normalized differences, each named by its kind — the reader can re-judge any of them.
        notCounted: diffs.filter((d) => d.kind !== "value" && d.kind !== "clock"),
        bookkeepingRules: BOOKKEEPING.map((b) => ({ readers: String(b.readers), path: String(b.path), why: b.why })),
        clockSample: diffs.filter((d) => d.kind === "clock").slice(0, 20),
      };
      await client.auth.signOut({ scope: "local" });
      if (refusal) throw new Error(refusal);
    });

    it(`${s.seat}: the store path answers what the old path answers (0 value differences)`, () => {
      const v = VERDICT[s.seat];
      if (!v) throw new Error(`UNMEASURED: ${s.seat}'s readers never ran.`);
      if (v.refusal) throw new Error(v.refusal);
      const named = Object.entries(v.byClass).sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${n}`).join("; ");
      if (v.valueDiffs > 0) throw new Error(`${s.seat}: ${v.valueDiffs} value differences between the old and store paths (${named}); PARITY_OUT has each one.`);
    });
  }

  afterAll(() => {
    const out = process.env.PARITY_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(REPORT, null, 2));
  });
});
