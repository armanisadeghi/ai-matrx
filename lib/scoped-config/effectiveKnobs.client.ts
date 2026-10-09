"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  effectiveKnobStoreVersion,
  ensureEffectiveKnob,
  knobAddress,
  peekEffectiveKnob,
  subscribeEffectiveKnob,
  type KnobRef,
  type KnobScope,
} from "./effectiveKnobs";
import { usePaintedOrganizationHeld } from "./paintedOrganization";
import { useSignedIn } from "./useSignedIn";

function scopeKeyOf(scopes: readonly KnobScope[] | undefined): string {
  return (scopes ?? []).map((scope) => `${scope.kind}:${scope.id}`).join(",");
}

/** React-only facade over the shared effective-knob snapshot cache. */
export function useEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): unknown {
  const fullKey = typeof ref === "string" ? ref : `${ref.feature}.${ref.key}`;
  const scopeKey = scopeKeyOf(scopes);
  const value = useSyncExternalStore(
    subscribeEffectiveKnob,
    () => peekEffectiveKnob(organizationId, userId, ref, scopes),
    () => undefined,
  );
  const version = useSyncExternalStore(
    subscribeEffectiveKnob,
    effectiveKnobStoreVersion,
    () => 0,
  );
  const signedIn = useSignedIn();
  const painted = usePaintedOrganizationHeld(organizationId);
  useEffect(() => {
    if (value !== undefined || !signedIn || painted) return;
    void ensureEffectiveKnob(organizationId ?? null, userId ?? null, ref, scopes).catch(
      (error: unknown) => {
        const address = knobAddress(ref);
        console.error(
          `[knob] ${fullKey} could not be resolved (feature='${address.feature}', ` +
            `key='${address.key}'), so every reader is falling back to its own ` +
            "default. Seed the row, or pass the register's { feature, key } pair:",
          error,
        );
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId, fullKey, scopeKey, value, version, signedIn, painted]);
  return value;
}
