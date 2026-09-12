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
// override (`overridable_by` non-empty) — the first consumer is
// `media.listening.voice` (Unified Settings Platform done-bar item 2).
//
// Framework-free, cached per (org, user, key) with a short TTL, invalidated
// on every write through `setKnobOverride` (same tab) and by the platform
// directive channel's `settings_changed` (other tabs, once Lane E lands). A
// React face is `useEffectiveKnob` below (useSyncExternalStore), so a control
// that shows the value re-renders the moment a write lands.

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";

const TTL_MS = 60_000;

type Entry = { value: unknown; at: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

function addr(organizationId: string, userId: string | null, fullKey: string): string {
  return `${organizationId}|${userId ?? ""}|${fullKey}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function splitKey(fullKey: string): { feature: string; key: string } {
  const at = fullKey.lastIndexOf(".");
  return { feature: fullKey.slice(0, at), key: fullKey.slice(at + 1) };
}

/**
 * The cached effective value, or `undefined` when nothing has been resolved
 * yet (callers treat `undefined` as "not answered" — never as a value).
 */
export function peekEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  fullKey: string,
): unknown {
  if (!organizationId) return undefined;
  const hit = cache.get(addr(organizationId, userId ?? null, fullKey));
  return hit ? hit.value : undefined;
}

/** Resolve (and cache) one effective value; concurrent callers share one call. */
export function ensureEffectiveKnob(
  organizationId: string,
  userId: string | null,
  fullKey: string,
): Promise<unknown> {
  const id = addr(organizationId, userId, fullKey);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const { feature, key } = splitKey(fullKey);
  const supabase = createClient();
  const run = (async () => {
    try {
      const { data, error } = await supabase.schema("platform").rpc("knob_resolve", {
        p_feature: feature,
        p_key: key,
        p_organization_id: organizationId,
        p_user_id: userId ?? undefined,
      } as never);
      if (error) throw new Error(`knob_resolve ${fullKey} failed: ${error.message}`);
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

/** Forget every cached value for one key (or everything, with no key). */
export function invalidateEffectiveKnob(fullKey?: string): void {
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
  fullKey: string,
): unknown {
  const value = useSyncExternalStore(
    subscribe,
    () => peekEffectiveKnob(organizationId, userId, fullKey),
    () => undefined,
  );
  useEffect(() => {
    if (!organizationId || value !== undefined) return;
    void ensureEffectiveKnob(organizationId, userId ?? null, fullKey).catch(() => {
      /* the caller's screen reports the failure; a runtime read never throws */
    });
  }, [organizationId, userId, fullKey, value]);
  return value;
}
