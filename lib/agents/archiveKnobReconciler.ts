// lib/agents/archiveKnobReconciler.ts
//
// 🚨 THE LATE-KNOB PROBLEM, for `@ai-matrx/agents/catalog`.
//
// THE ARCHIVED-ITEMS LAW (`../../../common-docs/policies/archived-items.md`,
// Arman 2026-09-09) clause 6: the archive filter's initial state is a knob, not
// code taste. The catalog takes that knob ONCE, as `defaults.archiveFilter` at
// `createAgentCatalog`, and stamps it onto each consumer when the consumer
// registers.
//
// The user preference behind it (`userPreferences.lists.archivedDefault`) is a
// warm cache that rehydrates AFTER first paint. Wired naively, the knob would
// be written, persisted, and then ignored by every picker that mounted before
// it landed — the setting saying one thing while the screen does another, which
// `lib/entity-list/useEntityList.ts` names as worse than having no knob at all.
//
// Its resolution is this file's rule, ported to the catalog's consumer model:
//
//   An UNTOUCHED archive axis follows the knob whenever it lands. The moment a
//   person moves the control on a picker, their choice owns that picker's axis
//   for the rest of the session.
//
// "Untouched" is never guessed. It is the exact value this reconciler last
// wrote to that consumer — or, for a consumer seen for the first time, the
// catalog's own creation default. A consumer that registered with its own
// `initialArchFilter` override therefore reads as owned from birth and is never
// overwritten, which is the contract that option advertises.

import type { AgentArchFilter } from "@ai-matrx/agents/catalog";

/** The slice of a catalog consumer this reconciler reads. */
export interface ArchiveKnobConsumer {
  archFilter: AgentArchFilter;
}

export interface ArchiveKnobReconcilerArgs {
  /** `catalog.consumerDefaults.archFilter` — the value a fresh consumer gets. */
  creationDefault: AgentArchFilter;
  /** `catalog.getState().consumers`. */
  getConsumers: () => Record<string, ArchiveKnobConsumer>;
  /** `catalog.setConsumerFilter(id, { archFilter })`. */
  apply: (consumerId: string, archFilter: AgentArchFilter) => void;
}

export interface ArchiveKnobReconciler {
  /** Bring every untouched consumer onto `knob`. Safe to call on every change. */
  reconcile: (knob: AgentArchFilter) => void;
  /** Consumers whose axis a person owns. Exposed for tests and diagnostics. */
  ownedConsumerIds: () => string[];
}

export function createArchiveKnobReconciler({
  creationDefault,
  getConsumers,
  apply,
}: ArchiveKnobReconcilerArgs): ArchiveKnobReconciler {
  /** consumerId → the archive filter THIS reconciler last applied to it. */
  const applied = new Map<string, AgentArchFilter>();
  /** Consumers taken over by a person. Never re-seeded. */
  const owned = new Set<string>();

  const reconcile = (knob: AgentArchFilter): void => {
    const consumers = getConsumers();
    const live = new Set(Object.keys(consumers));

    // Forget slots that were unregistered — a recycled id starts fresh.
    for (const id of [...applied.keys()]) if (!live.has(id)) applied.delete(id);
    for (const id of [...owned]) if (!live.has(id)) owned.delete(id);

    for (const [consumerId, consumer] of Object.entries(consumers)) {
      if (owned.has(consumerId)) continue;
      const last = applied.get(consumerId);
      if (last === undefined) {
        if (consumer.archFilter !== creationDefault) {
          // Arrived with its own `initialArchFilter`. Not ours to move.
          owned.add(consumerId);
          continue;
        }
      } else if (consumer.archFilter !== last) {
        // Somebody moved the control on that picker. It is theirs now.
        owned.add(consumerId);
        continue;
      }
      if (consumer.archFilter === knob) {
        applied.set(consumerId, knob);
        continue;
      }
      // Record BEFORE writing: the catalog publishes synchronously, which calls
      // this reconciler back, and it would otherwise read its own write as a
      // person's touch and hand the axis away.
      applied.set(consumerId, knob);
      apply(consumerId, knob);
    }
  };

  return { reconcile, ownedConsumerIds: () => [...owned] };
}
