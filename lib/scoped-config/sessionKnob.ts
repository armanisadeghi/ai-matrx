// lib/scoped-config/sessionKnob.ts
//
// The effective value of ONE knob for THIS session — the signed-in person in
// their active organization, on this device — for a feature that decides
// something at run time (which voice speaks, which model answers) and needs
// no organization/user plumbing of its own.
//
// Thin face over `effectiveKnobs.ts`: the principals come from the store
// (`appContext.organization_id`, `userAuth.id`), the read is the ONE
// ladder-resolved read (`platform.knob_resolve`, org → user → device, nearest
// wins), and the answer is cached + invalidated there. Two shapes:
//   `useSessionKnob(fullKey)`   — React: re-renders when the value lands or changes
//   `getSessionKnob(fullKey)`   — framework-free: the cached answer (warming the
//                                 cache when cold); `undefined` = not answered yet
//   `resolveSessionKnob(fullKey)` — framework-free, awaited: the answer
//
// `undefined` is never a value: a consumer treats it as "no answer yet" and
// uses its own default, exactly as it does for a knob whose value is "".

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  ensureEffectiveKnob,
  peekEffectiveKnob,
  useEffectiveKnob,
} from "./effectiveKnobs";

type PrincipalState = {
  appContext?: { organization_id?: string | null };
  userAuth?: { id?: string | null };
};

export function sessionKnobPrincipals(): { organizationId: string | null; userId: string | null } {
  const store = getStoreSingleton();
  if (!store) return { organizationId: null, userId: null };
  const state = store.getState() as PrincipalState;
  return {
    organizationId: state.appContext?.organization_id ?? null,
    userId: state.userAuth?.id ?? null,
  };
}

/** Cached effective value (warming the cache when cold); `undefined` until answered. */
export function getSessionKnob(fullKey: string): unknown {
  const { organizationId, userId } = sessionKnobPrincipals();
  if (!organizationId) return undefined;
  const hit = peekEffectiveKnob(organizationId, userId, fullKey);
  if (hit === undefined) {
    void ensureEffectiveKnob(organizationId, userId, fullKey).catch((error: unknown) => {
      console.error(`[sessionKnob] ${fullKey} could not be resolved — using the consumer's default until it can:`, error);
    });
  }
  return hit;
}

/** The effective value, awaited. `undefined` only when no organization is active. */
export async function resolveSessionKnob(fullKey: string): Promise<unknown> {
  const { organizationId, userId } = sessionKnobPrincipals();
  if (!organizationId) return undefined;
  return ensureEffectiveKnob(organizationId, userId, fullKey);
}

/** React face: the effective value for this session, `undefined` until resolved. */
export function useSessionKnob(fullKey: string): unknown {
  const organizationId = useAppSelector((s) => s.appContext?.organization_id ?? null);
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  return useEffectiveKnob(organizationId, userId, fullKey);
}
