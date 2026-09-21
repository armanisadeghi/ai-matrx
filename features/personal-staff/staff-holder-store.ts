"use client";

/**
 * features/personal-staff/staff-holder-store.ts
 *
 * WHO IS ANSWERING, once the door has said so.
 *
 * `/staff` paints its header on the SERVER from the mandate's system-rung
 * default Holder — the same first-paint trick `/chat/new` uses — because that
 * is the only rung a Server Component can honestly resolve
 * (`features/mandates/service.server.ts` explains why). The DOOR resolves the
 * real rung: an organization or a person that rebound
 * `personal_staff.front_line` gets a different Holder, with a different name.
 * A header still showing the platform default at that point is a screen
 * telling a lie — exactly what `door.py`'s `_holder_name` refuses to do on its
 * own side ("If the name cannot be read, the client shows no name — never a
 * hardcoded one").
 *
 * Why a module store rather than props or context: the header renders through
 * `<PageHeader>`, a PORTAL into the app shell's header — a sibling of `<main>`.
 * A provider under the route never reaches it. Same constraint, same shape and
 * the same reasoning as `features/surfaces/runtime/surface-mandates.ts`.
 *
 * Scope: one page, one staff thread. The room publishes on open and clears on
 * unmount, so nothing survives a navigation away.
 */

import { useSyncExternalStore } from "react";

export interface ResolvedStaffHolder {
  /** `agent.definition` id the door resolved. Never a version id. */
  agentId: string;
  /** The Holder's name, or null — which means render NO name. */
  agentName: string | null;
}

let current: ResolvedStaffHolder | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ResolvedStaffHolder | null {
  return current;
}

/** The server render knows nothing yet — the page's own SSR seed is the
 *  first-paint answer, and this must not disagree with it. */
function getServerSnapshot(): ResolvedStaffHolder | null {
  return null;
}

/** Publish the Holder the door resolved. */
export function publishResolvedStaffHolder(holder: ResolvedStaffHolder): void {
  if (
    current &&
    current.agentId === holder.agentId &&
    current.agentName === holder.agentName
  ) {
    return;
  }
  current = holder;
  emit();
}

/** Forget it. The room calls this on unmount so a later page never reads a
 *  stale Holder into its header. */
export function clearResolvedStaffHolder(): void {
  if (current === null) return;
  current = null;
  emit();
}

/** The Holder the door resolved, or null before it has answered. */
export function useResolvedStaffHolder(): ResolvedStaffHolder | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
