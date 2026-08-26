"use client";

/**
 * features/surfaces/runtime/surface-mandates.ts
 *
 * LIVE MANDATE DISCLOSURE — what AI is doing a job on this page, right now.
 *
 * 🚨 THE DISCLOSURE LAW (Arman, 2026-08-25): a page that runs an agent as a
 * built-in feature must NAME it — inline on the page (`<PageAgents>`) AND in
 * the Agents menu at the top, where every agent reachable from this surface is
 * listed. An agent behind a button that appears in neither is a black box.
 *
 * Why a module registry, not React context: the Agents header button lives in
 * the AppShell `<Header>`, a SIBLING of `<main>` — a provider under a route
 * never reaches it. Same reasoning, same shape, as `SurfaceRuntimeContext`.
 *
 * Why RUNTIME and not only the manifest: a manifest's `agentRoles` are static,
 * and several surfaces choose their mandate from live state (the run console
 * runs a different mandate per selected engine). Declared roles and live
 * registrations are merged by the header — the manifest is the contract, this
 * is the disclosure.
 *
 * 🚨 THE SELF-CONTEXT EXCEPTION: a surface where you BUILD or EDIT an agent
 * (the agent builder, mandate console, agent settings) must NOT register — the
 * agent under construction is the page's SUBJECT, not its worker, and handing
 * it context of itself is the opposite of what those pages want. Register only
 * agents that DO something for the user on this page.
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

/** Every mandate disclosed by the live page, de-duplicated by key. */
export function getLiveSurfaceMandates(): readonly SurfaceMandateRef[] {
  return snapshot;
}

/** Hook twin for chrome outside the page tree (the Agents header menu). */
export function useLiveSurfaceMandates(): readonly SurfaceMandateRef[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Declare the mandates this component's surface runs.
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
