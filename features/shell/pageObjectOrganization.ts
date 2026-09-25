"use client";

// features/shell/pageObjectOrganization.ts — LANE GATES-TAIL (VERIFIER-21 #7)
//
// THE PAGE'S OBJECT KNOWS ITS ORGANIZATION; THE SHELL HEADER BELIEVES IT.
//
// The shell header's red "Choose org" is a warning for pages that need a picked organization to
// do anything. On an OBJECT page — a table at /data-v2/<id>, a file at /files/f/<id> — the
// organization is read from the object (access is personal: the object opens whatever is
// picked), so a red "Choose org" there is a lie: nothing on the page is waiting for a choice.
//
// An object page DECLARES the organization its object lives in with
// `useDeclarePageObjectOrganization`, and the header's one org control
// (`HeaderChooseOrgButton`) reads the declaration instead of warning:
//   - the page already names the organization on screen (`shownByPage`) → the header shows
//     nothing (never the same name twice);
//   - the header knows the name → a quiet "Viewing in <org>";
//   - no name → nothing. Never the red warning while a declaration stands.
// The declaration is removed on unmount, so a list page after it warns again as before.

import { useEffect, useSyncExternalStore } from "react";

export interface PageObjectOrganization {
  organizationId: string;
  /** The organization's name when the page knows it; null when it does not. */
  name: string | null;
  /** True when the page itself already shows the organization (a chip beside the title). */
  shownByPage: boolean;
}

let current: PageObjectOrganization | null = null;
let token = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Declare (or replace) the page's object organization; returns the release function. */
export function declarePageObjectOrganization(next: PageObjectOrganization): () => void {
  token += 1;
  const mine = token;
  current = next;
  emit();
  return () => {
    if (token !== mine) return; // a later declaration replaced this one
    current = null;
    emit();
  };
}

export function readPageObjectOrganization(): PageObjectOrganization | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The header's read. */
export function usePageObjectOrganization(): PageObjectOrganization | null {
  return useSyncExternalStore(subscribe, readPageObjectOrganization, () => null);
}

/**
 * An object page's declaration. Pass null while the object's organization is not yet known —
 * the header then behaves as it does on any page.
 */
export function useDeclarePageObjectOrganization(next: PageObjectOrganization | null): void {
  const organizationId = next?.organizationId ?? null;
  const name = next?.name ?? null;
  const shownByPage = next?.shownByPage ?? false;
  useEffect(() => {
    if (!organizationId) return undefined;
    return declarePageObjectOrganization({ organizationId, name, shownByPage });
  }, [organizationId, name, shownByPage]);
}

/** Test seam. */
export function __resetPageObjectOrganizationForTest(): void {
  current = null;
  token += 1;
  emit();
}
