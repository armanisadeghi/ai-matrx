"use client";

/**
 * features/surfaces/runtime/surface-mandates.ts
 *
 * LIVE MANDATE DISCLOSURE — what AI is doing a job on this page, right now.
 *
 * 🚨 THE DISCLOSURE LAW: a page that already runs a fixed agent job registers
 * it in the existing Agents menu at the top. This registry renders NOTHING and
 * must never be used as authority to add chips, labels, rosters, or any other
 * visible page content. An undisclosed fixed job is a black box; inventing a
 * visible disclosure block is a different defect.
 *
 * Why a module registry, not React context: the Agents header button lives in
 * the AppShell `<Header>`, a SIBLING of `<main>` — a provider under a route
 * never reaches it. Same reasoning, same shape, as `SurfaceRuntimeContext`.
 *
 * Why RUNTIME and not only the manifest: a manifest's `agentRoles` are static,
 * and several surfaces choose their mandate from live state (the run console
 * runs a different mandate per selected engine). Declared roles and live
 * registrations are merged by the header — the manifest is the contract, this
 * is UI-free registration for the existing top menu.
 *
 * 🚨 THE SELF-CONTEXT EXCEPTION: a surface where you BUILD or EDIT an agent
 * (the agent builder, mandate console, agent settings) must NOT register — the
 * agent under construction is the page's SUBJECT, not its worker, and handing
 * it context of itself is the opposite of what those pages want. Universal
 * hosts such as Chat also register no available-agent roster. Register only a
 * fixed job that the surface already performs for the user.
 */

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";

export interface SurfaceMandateRef {
  /** `agent.mandate.mandate_key`, e.g. `seo.topic_assigner`. */
  mandateKey: string;
  /** What this agent does HERE, in the surface's own words. */
  does: string;
  /** The surface it was registered from, when the host knows its name. */
  surfaceName?: string | null;
}

interface Entry {
  id: number;
  refs: readonly SurfaceMandateRef[];
}

let nextId = 0;
let entries: Entry[] = [];
const listeners = new Set<() => void>();
/** Recomputed on write so `useSyncExternalStore` gets a stable snapshot. */
let snapshot: readonly SurfaceMandateRef[] = [];

function recompute() {
  const byKey = new Map<string, SurfaceMandateRef>();
  for (const entry of entries) {
    for (const ref of entry.refs) {
      // First registration of a key wins its wording — a later, vaguer
      // duplicate never overwrites the specific one.
      if (!byKey.has(ref.mandateKey)) byKey.set(ref.mandateKey, ref);
    }
  }
  snapshot = [...byKey.values()];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly SurfaceMandateRef[] {
  return snapshot;
}

const EMPTY: readonly SurfaceMandateRef[] = [];
function getServerSnapshot(): readonly SurfaceMandateRef[] {
  return EMPTY;
}

/** Imperative registration. Returns an unregister that clears only this entry. */
export function registerSurfaceMandates(
  refs: readonly SurfaceMandateRef[],
): () => void {
  const id = ++nextId;
  entries = [...entries, { id, refs }];
  recompute();
  return () => {
    entries = entries.filter((entry) => entry.id !== id);
    recompute();
  };
}

/** Every fixed mandate registered for the top menu, de-duplicated by key. */
export function getLiveSurfaceMandates(): readonly SurfaceMandateRef[] {
  return snapshot;
}

/** Hook twin for chrome outside the page tree (the Agents header menu). */
export function useLiveSurfaceMandates(): readonly SurfaceMandateRef[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Register fixed mandates this component's surface already runs in the top
 * Agents menu. This hook renders no UI; never add a visible disclosure sibling.
 *
 * ```ts
 * useDeclaredSurfaceMandates([
 *   { mandateKey: "seo.topic_assigner", does: "assigns keywords to topics" },
 * ]);
 * ```
 *
 * The KEY SET is the registration identity, so an inline array literal is fine
 * — it re-registers only when the set of keys actually changes.
 */
export function useDeclaredSurfaceMandates(
  refs: readonly SurfaceMandateRef[],
): void {
  const refsRef = useRef(refs);
  useEffect(() => {
    refsRef.current = refs;
  });

  const identity = refs
    .map((ref) => `${ref.mandateKey}|${ref.does}|${ref.surfaceName ?? ""}`)
    .sort()
    .join("\n");

  useEffect(() => {
    if (refsRef.current.length === 0) return;
    return registerSurfaceMandates([...refsRef.current]);
  }, [identity]);
}
