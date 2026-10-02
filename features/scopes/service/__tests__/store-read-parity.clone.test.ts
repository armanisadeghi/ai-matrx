/**
 * @jest-environment node
 */
/**
 * THE STORE READ PATH EQUALS THE OLD PATH, READER BY READER, SEAT BY SEAT — ON THE DEV CLONE
 * (lane SCOPES-READ-SWITCH-VALIDATE, 2026-09-30).
 *
 * The web's scope reads have two paths behind `scopesReadFromStore()` (knob `scopes/read_from_store`):
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
 *   2. "store equals old" — zero non-clock value differences, every reader.
 * Each seat runs on freshly loaded modules (jest.resetModules), so no module cache — the membership
 * read caches for 4 s by container type alone — can hand one seat the other's organizations.
 *
 * The guard's own proof: PARITY_PLANT=empty-memberships makes `mbr_for_user` answer no rows on both
 * paths (in memory, through the client this suite owns — no file and no row is touched); test 1 must
 * go RED for both seats. PARITY_PLANT=memberships-fail makes it fail on both paths; RED too.
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
const SEATS = [
  { seat: "admin", email: LOCAL.AI_ADMIN_USERNAME ?? "", password: LOCAL.AI_ADMIN_PASSWORD ?? "" },
  { seat: "member", email: "test@test.com", password: process.env.SEAT_PASSWORD ?? "" },
];
const READY = Boolean(URL_ && KEY && /nwvv|supabase\.co/.test(URL_) && !/matrxserver/.test(URL_) && SEATS.every((s) => s.email && s.password));
const describeClone = READY ? describe : describe.skip;
const PLANT = process.env.PARITY_PLANT ?? "";
if (PLANT && !["empty-memberships", "memberships-fail"].includes(PLANT)) throw new Error(`PARITY_PLANT=${PLANT} is not a plant this suite knows.`);

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
        if (prop === "rpc" && PLANT) {
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
function loadFreshModules() {
  jest.resetModules();
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

type Diff = { reader: string; arg: string; path: string; old: unknown; store: unknown; clock: boolean };

function strip(v: unknown): unknown {
  return v;
}

function diff(reader: string, arg: string, a: unknown, b: unknown, p: string, out: Diff[]) {
  if (Object.is(a, b)) return;
  const key = p.split(".").pop()?.replace(/\[\d+\]$/, "") ?? "";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push({ reader, arg, path: `${p}.length`, old: a.length, store: b.length, clock: false });
    }
    // Align lists of rows by id where they have one, so an order difference is named as such.
    const ids = (x: unknown[]) => x.map((e) => (e && typeof e === "object" && "id" in (e as object) ? String((e as { id: unknown }).id) : null));
    const ai = ids(a);
    const bi = ids(b);
    if (ai.every((x) => x) && bi.every((x) => x)) {
      if (ai.join() !== bi.join() && [...ai].sort().join() === [...bi].sort().join()) {
        out.push({ reader, arg, path: `${p}#order`, old: ai.slice(0, 12), store: bi.slice(0, 12), clock: false });
      }
      const bm = new Map(b.map((e, i) => [bi[i]!, e]));
      const am = new Map(a.map((e, i) => [ai[i]!, e]));
      for (const [id, e] of am) {
        if (!bm.has(id)) out.push({ reader, arg, path: `${p}[${id}]`, old: summary(e), store: "(missing)", clock: false });
        else diff(reader, arg, e, bm.get(id), `${p}[${id}]`, out);
      }
      for (const [id, e] of bm) if (!am.has(id)) out.push({ reader, arg, path: `${p}[${id}]`, old: "(missing)", store: summary(e), clock: false });
      return;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff(reader, arg, a[i], b[i], `${p}[${i}]`, out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) diff(reader, arg, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${p}.${k}`, out);
    return;
  }
  out.push({ reader, arg, path: p, old: strip(a), store: strip(b), clock: CLOCK_KEYS.has(key) });
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
const VERDICT: Record<string, { refusal: string | null; valueDiffs: number; byReader: Record<string, { value: number; clock: number }> }> = {};

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
        diff(reader, arg, o?.data ?? r.old, st?.data ?? r.store, "", diffs);
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

      const byReader: Record<string, { value: number; clock: number }> = {};
      for (const d of diffs) {
        const r = (byReader[d.reader] ??= { value: 0, clock: 0 });
        if (d.clock) r.clock += 1;
        else r.value += 1;
      }
      const treeErrorsExcluded = errors.filter((e) => e.reader !== "getScopeTree");
      const refusal = unmeasured(
        s.seat,
        { oldOk: treeOld?.ok !== false, storeOk: treeStore?.ok !== false, oldError: treeOld?.error, storeError: treeStore?.error, old: count(oldOrgs), store: count(storeOrgs) },
        treeErrorsExcluded,
      );
      VERDICT[s.seat] = { refusal, valueDiffs: diffs.filter((d) => !d.clock).length, byReader };
      (REPORT.seats as Record<string, unknown>)[s.seat] = {
        user: holder.userId,
        refusal,
        tree: { old: count(oldOrgs), store: count(storeOrgs) },
        timings,
        errors,
        byReader,
        diffs: diffs.filter((d) => !d.clock),
        clockSample: diffs.filter((d) => d.clock).slice(0, 20),
      };
      await client.auth.signOut();
      if (refusal) throw new Error(refusal);
    });

    it(`${s.seat}: the store path answers what the old path answers (0 value differences)`, () => {
      const v = VERDICT[s.seat];
      if (!v) throw new Error(`UNMEASURED: ${s.seat}'s readers never ran.`);
      if (v.refusal) throw new Error(v.refusal);
      const named = Object.entries(v.byReader).filter(([, n]) => n.value > 0).map(([r, n]) => `${r} ${n.value}`).join(", ");
      if (v.valueDiffs > 0) throw new Error(`${s.seat}: ${v.valueDiffs} value differences between the old and store paths (${named}); PARITY_OUT has each one.`);
    });
  }

  afterAll(() => {
    const out = process.env.PARITY_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(REPORT, null, 2));
  });
});
