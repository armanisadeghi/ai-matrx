// features/bindings/batch/batch-model.ts
//
// BATCH MODE'S BRAIN — pure, jest-held, and deliberately small.
//
// Batch is a MODE of the one binding UI, not a second screen: one rung and one
// holder chosen in the bar above apply to every row, and the rows are PLACES —
// the jobs this holder is being bound to. The middle, transposed (P17): places
// down the side, the holder's inputs across the top.
//
// Everything in this file answers one of three questions:
//
//   1. WHAT DOES THIS ROW SAY ABOUT ITSELF?  `placeHealth` — the row dot's
//      rule, computed from the SAME validators map mode saves through
//      (`consumptionMapProblems`), so the two modes can never disagree about
//      the same map. A dot that means something different from the sentence one
//      screen over is worse than no dot.
//   2. WHAT HAPPENS WHEN A MAPPING IS COPIED HERE?  `reconcilePlaceMap` — the
//      three-way keep / re-bind / clear rule (P17.2) over a whole consumption
//      map, through `reconcileCopiedTarget`, the ONE implementation the
//      shortcut grid's cell uses too.
//   3. MAY THIS BE WRITTEN?  `applyRefusal` — the words Apply is refused with,
//      counting exactly what stands in the way.
//
// Nothing here touches React, the network, or the store.

import { reconcileCopiedTarget } from "@/features/agent-shortcuts/components/batch/BatchBindingCell";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import {
  consumptionMapProblems,
  isOfferedSource,
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import {
  retargetSource,
  setSources,
  sourcesFor,
} from "../consumption-writer";

/** One place in the batch: a job this holder would be bound to. */
export interface PlaceRow {
  /** Row identity — the mandate key, which is also what the write addresses. */
  key: string;
  mandateId: string;
  mandateKey: string;
  label: string;
  /** ADD = nothing answers at this rung yet · UPD = this replaces an answer. */
  kind: "create" | "update";
  /** How many values this place offers — the price of the work, before it. */
  offeredCount: number | null;
}

export type PlaceOfferState =
  | { status: "loading" }
  | { status: "ready"; offered: readonly OfferedValue[] }
  | { status: "error"; message: string };

export interface PlaceHealth {
  /** Cells where a source is chosen but its value is not. */
  unmapped: number;
  /** …of those, the ones on a REQUIRED input. These gate the write. */
  requiredUnmapped: number;
  /** Map problems in domain words — the same pre-flight the save runs. */
  problems: readonly string[];
  /** Why this place cannot be written at all (requirement gate, dead offer). */
  blockers: readonly string[];
  /** Required inputs nothing feeds, where the holder has no default either. */
  unfedRequired: readonly string[];
  tone: "green" | "amber" | "red";
}

const EMPTY_HEALTH: PlaceHealth = {
  unmapped: 0,
  requiredUnmapped: 0,
  problems: [],
  blockers: [],
  unfedRequired: [],
  tone: "green",
};

function hasHolderDefault(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * THE ROW'S HEALTH, by the same rules map mode prints on its rows.
 *
 * RED is exactly "this row cannot be written": a required input whose source is
 * chosen but whose value is not, a map the server would refuse, or a place this
 * holder does not qualify for. AMBER is "look at this before you commit": an
 * optional input mid-pick, or a required input nothing feeds while the holder
 * has no default of its own — which map mode also states and also allows.
 */
export function placeHealth({
  targets,
  offered,
  map,
  blockers = [],
}: {
  targets: readonly BindingTarget[];
  offered: readonly OfferedValue[];
  map: ConsumptionMap;
  /** Reasons this place cannot be written, from the requirement gate. */
  blockers?: readonly string[];
}): PlaceHealth {
  if (targets.length === 0 && blockers.length === 0) return EMPTY_HEALTH;

  let unmapped = 0;
  let requiredUnmapped = 0;
  const unfedRequired: string[] = [];
  const chosenMap: ConsumptionMap = {};

  for (const target of targets) {
    const sources = sourcesFor(map, target.name);
    const chosen = sources.filter(
      (entry) => !isOfferedSource(entry) || entry.target !== "",
    );
    if (chosen.length > 0) chosenMap[target.name] = [...chosen];
    if (sources.length > chosen.length) {
      unmapped += 1;
      if (target.required === true) requiredUnmapped += 1;
    } else if (
      target.required === true &&
      sources.length === 0 &&
      !hasHolderDefault(target.defaultValue)
    ) {
      unfedRequired.push(target.label ?? target.name);
    }
  }

  const problems = consumptionMapProblems({ values: offered }, chosenMap);
  // A source chosen with no value picked is RED whether or not the input is
  // required, because it is an UNFINISHED CHOICE and the server refuses the
  // whole map over it — which is exactly what map mode's Save says too. Colour
  // and gate must agree, or the dot is decoration.
  const tone: PlaceHealth["tone"] =
    unmapped > 0 || problems.length > 0 || blockers.length > 0
      ? "red"
      : unfedRequired.length > 0
        ? "amber"
        : "green";

  return {
    unmapped,
    requiredUnmapped,
    problems,
    blockers,
    unfedRequired,
    tone,
  };
}

/**
 * WHY APPLY IS REFUSED — in words, with the count, or null when it may run.
 *
 * Printed BESIDE the button, never as a toast: a refusal that vanishes is a
 * refusal the person cannot act on, and the batch grid this is measured against
 * still answers with a toast (its own defect, filed rather than copied).
 */
export function applyRefusal(
  healths: readonly PlaceHealth[],
  pendingCount: number,
): string | null {
  if (pendingCount === 0) {
    return "Nothing left to apply — every place in this batch is written.";
  }
  const requiredUnmapped = healths.reduce(
    (acc, h) => acc + h.requiredUnmapped,
    0,
  );
  if (requiredUnmapped > 0) {
    return `${requiredUnmapped} required ${requiredUnmapped === 1 ? "input is" : "inputs are"} still unmapped. Fix the red cells first.`;
  }
  const unmapped = healths.reduce((acc, h) => acc + h.unmapped, 0);
  if (unmapped > 0) {
    return `${unmapped} ${unmapped === 1 ? "input is" : "inputs are"} still waiting for you to pick which offered value feeds ${unmapped === 1 ? "it" : "them"}. Fix the red cells first.`;
  }
  const blocked = healths.filter((h) => h.blockers.length > 0).length;
  if (blocked > 0) {
    return `${blocked} ${blocked === 1 ? "place" : "places"} cannot take this holder — the red rows say why. Remove them from the batch, or fix the holder.`;
  }
  const broken = healths.filter((h) => h.problems.length > 0).length;
  if (broken > 0) {
    return `${broken} ${broken === 1 ? "place has" : "places have"} a mapping problem named on the row. Fix the red rows first.`;
  }
  return null;
}

// ── The copied-mapping rule, over a whole map (P17.2) ────────────────────────

export interface ReconcileReport {
  map: ConsumptionMap;
  /** Value names kept as they were — they exist at this place too. */
  kept: readonly string[];
  /** Inputs re-bound to a value of their own name at this place. */
  rebound: readonly string[];
  /** Inputs cleared because this place offers nothing that fits. They go red. */
  cleared: readonly string[];
}

/**
 * Reconcile a map copied onto THIS place against what THIS place offers.
 *
 * Sources 1..n of a many-to-one target obey the same rule as source 0, with one
 * difference: an extra source that does not exist here is DROPPED rather than
 * left empty, because an empty extra is not a decision anyone made — the target
 * still has its first source, and the join simply loses a paragraph it was
 * never promised. Both outcomes are reported; nothing is silent.
 */
export function reconcilePlaceMap({
  map,
  targets,
  offered,
}: {
  map: ConsumptionMap;
  targets: readonly BindingTarget[];
  offered: readonly OfferedValue[];
}): ReconcileReport {
  const availableNames = offered.map((v) => v.name);
  const offeredByName = new Map(offered.map((v) => [v.name, v]));
  const kept: string[] = [];
  const rebound: string[] = [];
  const cleared: string[] = [];
  let next = map;

  for (const target of targets) {
    const sources = sourcesFor(next, target.name);
    if (sources.length === 0) continue;
    const rebuilt: ConsumptionEntry[] = [];
    sources.forEach((entry, index) => {
      // A literal and a question are the binding's OWN content — they carry to
      // every place unchanged, which is exactly what the fill-down promises.
      if (!isOfferedSource(entry)) {
        rebuilt.push(entry);
        return;
      }
      // An EXTRA source (1..n) is never re-bound by name: source 0 already owns
      // the input's own name, so re-binding an extra to it would join the same
      // value to itself — the same paragraph twice, which the one writer
      // forbids on purpose. An extra either exists here or it is dropped.
      const verdict =
        index === 0
          ? reconcileCopiedTarget({
              inheritedTarget: entry.target,
              targetName: target.name,
              availableNames,
            })
          : availableNames.includes(entry.target)
            ? ({ action: "keep" } as const)
            : ({ action: "clear", target: "" } as const);
      const alreadyJoined = rebuilt.some(
        (other) =>
          other.mapType === "offered_value" &&
          other.target !== "" &&
          other.target === entry.target,
      );
      if (verdict.action === "keep" && !alreadyJoined) {
        if (entry.target) kept.push(entry.target);
        rebuilt.push(
          retargetSource(entry, entry.target, offeredByName.get(entry.target)),
        );
        return;
      }
      if (verdict.action === "keep") {
        cleared.push(target.label ?? target.name);
        return;
      }
      if (verdict.action === "rebind") {
        rebound.push(target.label ?? target.name);
        rebuilt.push(
          retargetSource(
            entry,
            verdict.target,
            offeredByName.get(verdict.target),
          ),
        );
        return;
      }
      // clear
      if (index === 0) {
        cleared.push(target.label ?? target.name);
        rebuilt.push(retargetSource(entry, "", undefined));
      } else {
        cleared.push(target.label ?? target.name);
      }
    });
    next = setSources(next, target.name, rebuilt);
  }

  return { map: next, kept, rebound, cleared };
}

/** One line naming what reconciling did — never silent (law 4). */
export function reconcileSentence(report: ReconcileReport): string | null {
  const parts: string[] = [];
  if (report.rebound.length > 0) {
    parts.push(
      `re-bound ${report.rebound.length} ${report.rebound.length === 1 ? "input" : "inputs"} to a value of the same name here`,
    );
  }
  if (report.cleared.length > 0) {
    parts.push(
      `cleared ${report.cleared.length} ${report.cleared.length === 1 ? "input" : "inputs"} this place cannot feed`,
    );
  }
  if (parts.length === 0) return null;
  return `Filled down, then ${parts.join(" and ")}.`;
}
