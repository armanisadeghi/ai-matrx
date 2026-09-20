// lib/scoped-config/effectiveKnobs.ts
//
// THE runtime read of ladder-resolved settings for the signed-in person — the
// answers `platform.knob_snapshot` gives for (organization, user, scopes), the
// same nearest-rung-wins resolution the settings surface shows, so a feature
// that consumes a setting and the screen that edits it can never disagree.
//
// 🚨 ONE FETCH, NOT ONE PER SETTING (Arman, 2026-09-20: *"the one thing that
// absolutely cannot happen is that we can't be fetching individual
// configurations for everything that we do, and we can't be trying to do these
// things live or through any sort of application level logic regardless of if
// it's a server or the client"*). Until this file was rewritten, every knob a
// screen read was its own `platform.knob_resolve` round trip: the Masterwork
// record surface alone opened five, the Question Desk five more, and a page
// carrying both paid ten network calls to learn ten small values. The whole
// register — every knob, resolved for this person in this organization — is
// 870 keys and 44 kB and answers in 47 ms, measured live on 2026-09-20. So the
// client fetches THAT, once per (organization, user, scope address), and every
// read after it is a lookup in a `Map`. Adding a knob to a screen now costs
// nothing at run time, which is the property that makes law 6 ("opinions become
// knobs") affordable.
//
// A missing key is not a default nobody chose: `knob_snapshot` carries a row
// for every registered knob, so an address the map does not hold is a knob that
// is NOT SEEDED, and `ensureEffectiveKnob` says so by name with the remedy —
// the same failure `knob_resolve`'s `P0001 … is not seeded` used to raise.
//
// It also ends the dotted-address ambiguity at the READ: the map is keyed by
// `feature || '.' || key`, and re-joining a ref that was split at its last dot
// reproduces that string exactly, whichever segment the dot really belonged to.
// The pair still matters for WRITES (`knob_override_set`) and for the failure
// message, so `knobAddress` stays.
//
// `lib/knobs/featureKnobs.ts` reads the PLATFORM value of a register row (the
// admin limits); this module reads the EFFECTIVE value after the organization,
// device and personal rungs. Use this one for anything a person or organization
// may override (`overridable_by` non-empty).
//
// Cache busting is event-driven, exactly as Arman described ("just like we have
// with editing agents"): every write through `setKnobOverride` (same tab) and
// the platform directive channel's `settings_changed` (other tabs, the server)
// drops the snapshots, and the next read re-fetches one. The 60s TTL below is a
// backstop for a missed directive, not the mechanism. A React face is
// `useEffectiveKnob` (useSyncExternalStore), so a control showing the value
// re-renders the moment a write lands.
import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";
import { getWebDeviceId } from "./deviceId";

const TTL_MS = 60_000;

/**
 * Every registered knob, resolved for one (organization, user, scope address).
 * `resolved` is keyed by `feature || '.' || key` exactly as the RPC builds it;
 * `stamp` is the database's own `now()` at resolution, carried so a log or a
 * future conditional re-fetch can say WHICH answers a screen is showing.
 */
type Snapshot = { resolved: Record<string, unknown>; stamp: string | null; at: number };

const snapshots = new Map<string, Snapshot>();
const inFlight = new Map<string, Promise<Snapshot>>();
const listeners = new Set<() => void>();

/**
 * 🚨 A FETCH THAT STARTED BEFORE A WRITE MUST NOT OUTLIVE IT.
 *
 * Every invalidation bumps this. A fetch reads it before it asks and again
 * when the answer lands: if it moved, that answer describes the register as it
 * was BEFORE the write, and installing it would put the pre-write value back
 * in the cache — where `useEffectiveKnob` would see a defined value, stop
 * asking, and show the person the setting they just changed away from, for a
 * whole TTL. Clearing the cache alone does not prevent this, because the
 * in-flight promise resolves afterwards and writes into the cleared map
 * (found by Cursor Bugbot on PR 238, 2026-09-20, before it ever ran).
 */
let generation = 0;

/** How many times a fetch re-asks when a write lands mid-flight. */
const MAX_RACE_RETRIES = 3;

/**
 * A rung nearer than the organization that this READ should take into account —
 * the entity the value is being resolved FOR (`{ kind: "rulebook", id }`,
 * `{ kind: "agent", id }`, …). The rung must be registered in
 * `platform.knob_scope_kind` and named in the knob's `overridable_by`, or the
 * resolver ignores it; the device rung is added automatically below and never
 * belongs here.
 */
export interface KnobScope {
  kind: string;
  id: string;
}

/**
 * The `p_scopes` payload: this browser's device rung plus whatever entity rungs
 * the caller is resolving for. `undefined` (not `[]`) when there is nothing to
 * send — `knob_resolve` raises `22023` on anything that is not an array or NULL.
 */
function buildScopes(
  deviceId: string | null | undefined,
  scopes: readonly KnobScope[] | undefined,
): KnobScope[] | undefined {
  const all: KnobScope[] = [];
  if (deviceId) all.push({ kind: "device", id: deviceId });
  for (const scope of scopes ?? []) {
    if (scope?.kind && scope?.id) all.push({ kind: scope.kind, id: scope.id });
  }
  return all.length > 0 ? all : undefined;
}

function scopeAddr(scopes: readonly KnobScope[] | undefined): string {
  if (!scopes?.length) return "";
  return scopes.map((s) => `${s.kind}:${s.id}`).join(",");
}

/**
 * The SNAPSHOT's address — never a key's. The entity rungs are part of it: two
 * Rulebooks in one org can legitimately resolve the same key to different
 * values, and a cache that forgot them would serve one Rulebook's answer for
 * another. The organization is in it for the same reason, one rung up: a person
 * in two organizations gets two snapshots, never one blended answer.
 */
function snapshotAddr(
  organizationId: string,
  userId: string | null,
  scopes?: readonly KnobScope[],
): string {
  return `${organizationId}|${userId ?? ""}|${scopeAddr(scopes)}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * 🚨 A KNOB'S ADDRESS IS THE PAIR, NEVER A STRING A HELPER RE-GUESSES
 * (VERIFY-U-P2-R4, V13-2). `platform.knob_resolve` takes `(p_feature, p_key)`
 * and `platform.feature_knob`'s primary key IS that pair — and neither half is
 * recoverable from one dotted string: live on 2026-09-17, 635 of 812 rows have a
 * dot INSIDE `feature` (`media.listening` + `voice`) and 58 have one inside
 * `key` (`connectors` + `prompt.resurface_days`). The connector prompt card read
 * `"connectors.prompt.resurface_days"`, the last-dot split sent
 * `('connectors.prompt','resurface_days')`, the database answered
 * `P0001 knob connectors.prompt.resurface_days is not seeded`, and the raise died
 * in an empty catch — so the knob PLAN §7 rules could never resolve and nothing
 * on any screen said so.
 *
 * A caller passes the register's own pair. The dotted string stays as a
 * convenience for the majority of rows whose feature is everything before the
 * last dot, and that convention is no longer assumed: every call site in the
 * repo is resolved through this function and matched against the declared rows
 * by `__tests__/every-knob-read-addresses-a-real-row.test.ts`.
 */
export interface KnobAddress {
  feature: string;
  key: string;
}

/** The pair, or the dotted convenience form of it. */
export type KnobRef = string | KnobAddress;

/** THE ONE PLACE A REF BECOMES THE PAIR THE RESOLVER SENDS. */
export function knobAddress(ref: KnobRef): KnobAddress {
  if (typeof ref !== "string") return { feature: ref.feature, key: ref.key };
  const at = ref.lastIndexOf(".");
  if (at <= 0 || at === ref.length - 1) {
    throw new Error(
      `knob "${ref}" has no feature segment — a knob is addressed by the register's ` +
        "own (feature, key) pair; pass { feature, key }.",
    );
  }
  return { feature: ref.slice(0, at), key: ref.slice(at + 1) };
}

/** The cache/invalidation address — unambiguous in this direction only. */
function fullKeyOf(ref: KnobRef): string {
  return typeof ref === "string" ? ref : `${ref.feature}.${ref.key}`;
}

/**
 * The cached effective value, or `undefined` when this (organization, user,
 * scope) snapshot has not landed yet — or when it landed and carries no such
 * address at all. Callers treat `undefined` as "not answered", never as a
 * value; the unseeded case is named, loudly, by `ensureEffectiveKnob`.
 */
export function peekEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): unknown {
  if (!organizationId) return undefined;
  const snapshot = snapshots.get(snapshotAddr(organizationId, userId ?? null, scopes));
  if (!snapshot) return undefined;
  return snapshot.resolved[fullKeyOf(ref)];
}

/**
 * Fetch (once) the whole resolved register for this person in this
 * organization, then answer from it. Concurrent callers — the five knobs one
 * surface reads on mount, and every other surface mounted beside it — share
 * the ONE call.
 */
export function ensureEffectiveKnob(
  organizationId: string,
  userId: string | null,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): Promise<unknown> {
  const fullKey = fullKeyOf(ref);
  return ensureKnobSnapshot(organizationId, userId, scopes).then((snapshot) => {
    if (!(fullKey in snapshot.resolved)) {
      // 🚨 A KNOB THAT IS NOT SEEDED IS A NAMED FAILURE WITH A REMEDY, never a
      // default nobody chose (law 4). The snapshot carries a row for EVERY
      // registered knob, so an address it does not hold is not seeded — the
      // same condition `knob_resolve` raised `P0001 … is not seeded` for, now
      // decided locally and with the pair spelled out.
      const { feature, key } = knobAddress(ref);
      throw new Error(
        `no knob is registered for feature='${feature}', key='${key}' ` +
          `(read as "${fullKey}"): platform.knob_snapshot answered for this ` +
          "organization and carries no such address. Either the row is not " +
          "seeded — seed it in a platform.feature_knob migration — or the " +
          "address is wrong: pass the register's own { feature, key } pair, " +
          "never a dotted string a helper has to re-split.",
      );
    }
    return snapshot.resolved[fullKey];
  });
}

/** ONE round trip. No caching, no races — the caller owns both. */
async function fetchKnobSnapshot(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string | null,
  scopes: readonly KnobScope[] | undefined,
  deviceId: string | null,
): Promise<Snapshot> {
  // `knob_snapshot` is not in `types/database.types.ts` yet: regenerating it
  // needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (the strip step
  // reads `platform.entity_types.client_excluded_columns`, and a file that
  // was not stripped must never be committed as if it were), and this
  // session has neither. So the RPC name is cast HERE, narrowly, and the
  // remedy is: run `pnpm db-types` from an environment that has those two
  // variables, then delete this cast — the call itself needs no other
  // change. Nothing else in this file is untyped.
  const { data, error } = await (
    supabase.schema("platform") as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("knob_snapshot", {
    p_organization_id: organizationId,
    p_user_id: userId ?? undefined,
    p_scopes: buildScopes(deviceId, scopes),
  });
  if (error) {
    throw new Error(
      `platform.knob_snapshot could not answer for organization='${organizationId}': ` +
        `${error.message}. Every setting on this screen is falling back to its ` +
        "consumer's own default until it can. A 42501 here means the signed-in " +
        "person is not a member of that organization — the read is gated on " +
        "membership by design.",
    );
  }
  const payload = (data ?? {}) as { resolved?: Record<string, unknown>; stamp?: string };
  return {
    resolved: payload.resolved ?? {},
    stamp: payload.stamp ?? null,
    at: Date.now(),
  };
}

/**
 * THE ONE NETWORK READ. Everything a screen asks about settings is answered
 * from what this returns; nothing in this repo resolves a single knob over the
 * wire (guard: `pnpm check:knob-snapshot-adoption`).
 */
export function ensureKnobSnapshot(
  organizationId: string,
  userId: string | null,
  scopes?: readonly KnobScope[],
): Promise<Snapshot> {
  const id = snapshotAddr(organizationId, userId, scopes);
  const hit = snapshots.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const supabase = createClient();
  // THIS browser's device rung (USD-9) rides as a scope so a device-level
  // override (nearest rung of all) wins here exactly as it does on the
  // settings screen (`knob_index` takes it as `p_device_id`).
  const deviceId = getWebDeviceId();
  // A token, not the promise itself: the `finally` below must ask "is the
  // entry under this address still MINE?", and comparing against `run` inside
  // its own initializer is not something the compiler will vouch for.
  const mine: { promise?: Promise<Snapshot> } = {};
  const run = (async () => {
    try {
      for (let attempt = 0; ; attempt += 1) {
        const askedAt = generation;
        const snapshot = await fetchKnobSnapshot(
          supabase,
          organizationId,
          userId,
          scopes,
          deviceId,
        );
        if (generation === askedAt) {
          snapshots.set(id, snapshot);
          notify();
          return snapshot;
        }
        // A write landed while this was in flight. The answer in hand predates
        // it, so it is never cached; ask again for one that does not.
        if (attempt >= MAX_RACE_RETRIES) {
          // Writes are still arriving faster than a round trip. Hand this
          // caller the newest answer we have WITHOUT caching it, so the next
          // read starts clean rather than inheriting a value we know is
          // behind — `useEffectiveKnob` sees `undefined`, re-runs its effect
          // and re-fetches. It self-heals; it does not go quiet (law 4).
          console.warn(
            `[knob] gave up re-reading platform.knob_snapshot for organization='${organizationId}' ` +
              `after ${MAX_RACE_RETRIES} writes landed mid-flight. The answer returned is not ` +
              "cached, so the next read fetches a fresh one.",
          );
          notify();
          return snapshot;
        }
      }
    } finally {
      // Only retire OUR entry: an invalidation may have cleared the map and a
      // newer fetch may already be registered under this address.
      if (inFlight.get(id) === mine.promise) inFlight.delete(id);
    }
  })();
  mine.promise = run;
  inFlight.set(id, run);
  return run;
}

// Opt in to the platform client-directive channel (Lane E, 2026-09-11): an
// `instant` key changed somewhere — another tab, another admin, the server —
// so forget it here and let every mounted reader re-resolve. Module-level
// registration, once per tab; the registry ignores a signed-out tab.
if (typeof window !== "undefined") {
  registerDirectiveHandler("settings_changed", (payload) => {
    invalidateEffectiveKnob(`${payload.feature}.${payload.key}`);
  });
}

/**
 * Forget the cached answers. The unit of caching is the SNAPSHOT, so one knob
 * changing drops the snapshots that could be carrying it and the next read
 * re-fetches one — one call, not one per knob, which is the whole point. The
 * `ref` is kept in the signature because every caller has one and it makes the
 * intent readable at the call site; it deliberately does not narrow the drop.
 */
export function invalidateEffectiveKnob(_ref?: KnobRef): void {
  // The bump is the half that a `clear()` alone cannot do: it tells every
  // fetch already in flight that its answer is now historical, so none of them
  // can reinstall the pre-write register behind this call. Dropping the
  // in-flight entries as well means a reader arriving after this point starts
  // its own fetch rather than joining one that began before the write.
  generation += 1;
  snapshots.clear();
  inFlight.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React face: the effective value for the signed-in person in an
 * organization, re-rendering when a write lands. `undefined` until resolved.
 */
export function useEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): unknown {
  const fullKey = fullKeyOf(ref);
  // Scopes are compared by their address, so a caller may pass a fresh array
  // literal every render without re-resolving on every render.
  const scopeKey = scopeAddr(scopes);
  const value = useSyncExternalStore(
    subscribe,
    () => peekEffectiveKnob(organizationId, userId, ref, scopes),
    () => undefined,
  );
  useEffect(() => {
    if (!organizationId || value !== undefined) return;
    void ensureEffectiveKnob(organizationId, userId ?? null, ref, scopes).catch(
      (error: unknown) => {
        // 🚨 IT SCREAMS (law 4). The old comment here said "the caller's screen
        // reports the failure" — no caller did, and a knob whose RPC raised on
        // every mount read exactly like a knob with no value (V13-2). A runtime
        // read still never throws into render; it says what failed and what to
        // do, once per address, where an agent and an operator will see it.
        const address = knobAddress(ref);
        console.error(
          `[knob] ${fullKey} could not be resolved (feature='${address.feature}', ` +
            `key='${address.key}'), so every reader is falling back to its own ` +
            "default. Seed the row, or pass the register's { feature, key } pair:",
          error,
        );
      },
    );
    // `scopes` is addressed by `scopeKey`; depending on the array identity
    // would re-run this effect on every render for a caller that builds it
    // inline, which every caller does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId, fullKey, scopeKey, value]);
  return value;
}
