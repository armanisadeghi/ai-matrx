"use client";

// lib/scoped-config/paintedOrganization.ts — lane SHELL-DEDUPE
//
// A PAINTED ORGANIZATION IS NOT AN ANSWER YET.
//
// `appContextSlice` fills an empty tab from the browser cache so the sidebar shows something at once,
// and says outright that this "only paints — no request leaves on it": the load ladder's answer (the
// account's last active organization) wins a moment later. A knob read on the painted organization
// is one wasted `knob_snapshot_delta` for an organization the person then leaves. So a read keyed to
// the organization the store is still only painting waits for the ladder; every other organization
// (a page's own, an explicit one, none) is asked at once.

import { useContext, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";

type StateWithContext = { appContext?: { organization_id?: string | null; orgBootstrapResolved?: boolean } };

export function isOnlyPainted(organizationId: string | null | undefined, state: StateWithContext): boolean {
  const context = state.appContext;
  return Boolean(organizationId) && !!context && context.orgBootstrapResolved === false && context.organization_id === organizationId;
}

/** True while `organizationId` is the organization the store has only painted from its cache. */
export function usePaintedOrganizationHeld(organizationId: string | null | undefined): boolean {
  const store = useContext(ReactReduxContext)?.store;
  return useSyncExternalStore(
    (listener) => (store ? store.subscribe(listener) : () => {}),
    () => (store ? isOnlyPainted(organizationId, store.getState() as StateWithContext) : false),
    () => false,
  );
}
