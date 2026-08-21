// features/flashcards/data/collapse.ts
//
// COLLAPSE-ON-MASTERY (FastFire spec 26a / Q15 #4): `expands_into` shipped as
// half a mechanic — a struggling concept card expands into atomic sub-cards,
// but nothing ever folded them back, so an enhanced card permanently drilled
// beside its own children. This is the other half, as ONE pure queue resolver
// every study queue can call (never per-surface logic):
//
//   • While ANY sub-card of a parent is still active, the drill works the
//     sub-cards and the PARENT steps aside (it duplicates its children).
//   • A sub-card leaves the queue when the learner has mastered it — or when
//     they explicitly collapsed it. When ALL of a parent's sub-cards are
//     folded, the parent returns: the concept collapsed back into one card.
//
// The durable per-learner decision lives on `education.item_mastery.
// collapse_state` (existing column, default 'auto'): 'auto' derives from
// mastery below; 'collapsed'/'expanded' are learner overrides that always win.

import type { ItemMasteryRow } from "@/features/education/study/types";

/** collapse_state vocabulary (DB default is 'auto'). */
export type CollapseState = "auto" | "collapsed" | "expanded";

// Auto-collapse thresholds — agent decision under blind approval (basis: FSRS
// treats a 3-streak with high mastery as stable recall; one lucky hit must not
// hide a card). Review 2026-10-21.
export const COLLAPSE_MIN_STREAK = 3;
export const COLLAPSE_MIN_MASTERY = 0.8;

/** Is this sub-card effectively folded for this learner? */
export function isEffectivelyCollapsed(
  mastery: ItemMasteryRow | undefined,
): boolean {
  const state = (mastery?.collapse_state ?? "auto") as CollapseState;
  if (state === "collapsed") return true;
  if (state === "expanded") return false;
  if (!mastery) return false;
  return (
    (mastery.streak ?? 0) >= COLLAPSE_MIN_STREAK &&
    (mastery.mastery_score ?? 0) >= COLLAPSE_MIN_MASTERY
  );
}

export interface ResolvedQueue<T> {
  /** The cards to actually drill, original order preserved. */
  queue: T[];
  /** Sub-cards folded out (mastered or learner-collapsed). */
  foldedChildIds: string[];
  /** Parents stepping aside while their sub-cards are still active. */
  deferredParentIds: string[];
}

/**
 * Resolve a card queue against the expansion graph + this learner's mastery.
 * Pure. `edgesByParent` maps parent card id → its sub-card ids (from the
 * `expands_into` association edges); cards absent from the graph pass through.
 */
export function resolveQueue<T extends { id: string }>(
  cards: T[],
  edgesByParent: Record<string, string[]>,
  masteryByItem: Record<string, ItemMasteryRow | undefined>,
): ResolvedQueue<T> {
  const inDeck = new Set(cards.map((c) => c.id));
  const foldedChildIds: string[] = [];
  const deferredParentIds: string[] = [];

  // Child → folded? Only children actually present in this deck count.
  const childFolded = new Map<string, boolean>();
  for (const children of Object.values(edgesByParent)) {
    for (const childId of children) {
      if (!inDeck.has(childId)) continue;
      childFolded.set(childId, isEffectivelyCollapsed(masteryByItem[childId]));
    }
  }

  const drop = new Set<string>();
  for (const [parentId, children] of Object.entries(edgesByParent)) {
    const present = children.filter((id) => inDeck.has(id));
    if (present.length === 0) continue;
    const activeChildren = present.filter((id) => !childFolded.get(id));
    if (activeChildren.length === 0) {
      // Concept collapsed back into one card: children out, parent stays.
      for (const id of present) {
        drop.add(id);
        foldedChildIds.push(id);
      }
    } else if (inDeck.has(parentId)) {
      // Sub-cards still being learned: they drill, the parent steps aside.
      drop.add(parentId);
      deferredParentIds.push(parentId);
      for (const id of present) {
        if (childFolded.get(id)) {
          drop.add(id);
          foldedChildIds.push(id);
        }
      }
    }
  }

  return {
    queue: cards.filter((c) => !drop.has(c.id)),
    foldedChildIds,
    deferredParentIds,
  };
}
