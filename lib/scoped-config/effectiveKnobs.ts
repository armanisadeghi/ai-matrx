// lib/scoped-config/effectiveKnobs.ts
//
// THE runtime read of ONE ladder-resolved value for the signed-in person —
// the answer `platform.knob_resolve` gives for (organization, user), the same
// nearest-rung-wins resolution the settings surface shows, so a feature that
// consumes a setting and the screen that edits it can never disagree.
//
// `lib/knobs/featureKnobs.ts` reads the PLATFORM value of a register row (the
// admin limits); this module reads the EFFECTIVE value after the organization
// and personal rungs. Use this one for anything a person or organization may
// override (`overridable_by` non-empty). Consumers today:
//   `media.listening.voice`                            → features/audio/service/listeningConfig.ts
//   `agents.model_prefs.chat_default_model`            → features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts
//   `agents.model_prefs.agent_authoring_default_model` → features/agents/agent-creators (the generator's run override)
//
// Framework-free, cached per (org, user, key) with a short TTL, invalidated
// on every write through `setKnobOverride` (same tab) and by the platform
// directive channel's `settings_changed` (other tabs, once Lane E lands). A
// React face is `useEffectiveKnob` below (useSyncExternalStore), so a control
// that shows the value re-renders the moment a write lands.

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";
import { getWebDeviceId } from "./deviceId";

const TTL_MS = 60_000;

type Entry = { value: unknown; at: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

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

function addr(
  organizationId: string,
  userId: string | null,
  fullKey: string,
  scopes?: readonly KnobScope[],
): string {
  // The entity rungs are part of the ADDRESS: two Rulebooks in one org can
  // legitimately resolve the same key to different values, and a cache that
  // forgot them would serve one Rulebook's answer for another.
  return `${organizationId}|${userId ?? ""}|${scopeAddr(scopes)}|${fullKey}`;
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
 * The cached effective value, or `undefined` when nothing has been resolved
 * yet (callers treat `undefined` as "not answered" — never as a value).
 */
export function peekEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): unknown {
  if (!organizationId) return undefined;
  const hit = cache.get(
    addr(organizationId, userId ?? null, fullKeyOf(ref), scopes),
  );
  return hit ? hit.value : undefined;
}

/** Resolve (and cache) one effective value; concurrent callers share one call. */
export function ensureEffectiveKnob(
  organizationId: string,
  userId: string | null,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): Promise<unknown> {
  const fullKey = fullKeyOf(ref);
  const id = addr(organizationId, userId, fullKey, scopes);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const { feature, key } = knobAddress(ref);
  const supabase = createClient();
  // THIS browser's device rung (USD-9) rides as a scope so a device-level
  // override (nearest rung of all) wins here exactly as it does on the
  // settings screen (`knob_index` takes it as `p_device_id`).
  const deviceId = getWebDeviceId();
  const run = (async () => {
    try {
      const { data, error } = await supabase.schema("platform").rpc("knob_resolve", {
        p_feature: feature,
        p_key: key,
        p_organization_id: organizationId,
        p_user_id: userId ?? undefined,
        p_scopes: buildScopes(deviceId, scopes),
      } as never);
      if (error) {
        // 🚨 A KNOB THAT IS NOT SEEDED IS A NAMED FAILURE WITH A REMEDY, never a
        // default nobody chose (law 4). `knob_resolve` RAISES `P0001 … is not
        // seeded`, and until 2026-09-17 that raise reached an empty catch, so an
        // unresolvable address behaved exactly like a value of `undefined`.
        throw new Error(
          `knob_resolve could not answer for feature='${feature}', key='${key}' ` +
            `(read as "${fullKey}"): ${error.message}. Either the row is not seeded — ` +
            "seed it in a platform.feature_knob migration — or the address is wrong: " +
            "pass the register's own { feature, key } pair, never a dotted string a " +
            "helper has to re-split.",
        );
      }
      cache.set(id, { value: data as unknown, at: Date.now() });
      notify();
      return data as unknown;
    } finally {
      inFlight.delete(id);
    }
  })();
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

/** Forget every cached value for one knob (or everything, with no ref). */
export function invalidateEffectiveKnob(ref?: KnobRef): void {
  const fullKey = ref === undefined ? undefined : fullKeyOf(ref);
  if (!fullKey) {
    cache.clear();
  } else {
    for (const id of [...cache.keys()]) {
      if (id.endsWith(`|${fullKey}`)) cache.delete(id);
    }
  }
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
