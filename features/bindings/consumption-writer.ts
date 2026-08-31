// features/bindings/consumption-writer.ts
//
// 🚨 THE ONE WRITER for a mandate binding's consumption map.
//
// Every edit the one binding UI makes to a draft map goes through a function in
// this file. Nothing else in `features/bindings/` constructs a ConsumptionEntry
// or mutates a ConsumptionMap. That is deliberate: the map's SHAPE is still
// moving (D18.2 landed many-to-one on 2026-08-31; direct literals and
// ask-the-user are not expressible yet — see THE REFUSAL below), and a shape
// change must be one file's worth of work, never a sweep through the UI.
//
// The shape written here is the CURRENT one, verbatim from
// `features/mandates/provision-shapes.ts`:
//
//   ConsumptionMap = Record<holderInputName, ConsumptionEntry[]>
//   ConsumptionEntry = { mapType: "offered_value"; target: offeredValueName;
//                        deliver: "variable" | "context";
//                        when_absent?; default?; required? }
//
// ── THE REFUSAL ──────────────────────────────────────────────────────────────
// The shared row component offers four sources. A mandate binding can carry
// TWO of them today, because the server's consumption-map validator accepts
// `offered_value` (and legacy `code_value`) and nothing else — aidream
// `services/mandates/provisions.py`: "mapType {..!r} is not valid in a
// consumption map — consume offered values (mapType 'offered_value')". So a
// Direct Value or Prompt User pick cannot be stored, and this module answers
// with a refusal IN DOMAIN WORDS instead of writing something the save would
// 422 on. When the server learns those two branches, `refusalForMapping`
// returns null for them and the UI gains both with no other edit.

import type { ValueMapping } from "@/features/surfaces/types";
import {
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";

/** The ordered sources feeding one holder input — [] when nothing feeds it. */
export function sourcesFor(
  map: ConsumptionMap,
  targetName: string,
): readonly ConsumptionEntry[] {
  return map[targetName] ?? [];
}

/** Replace the whole ordered source list for one holder input. */
export function setSources(
  map: ConsumptionMap,
  targetName: string,
  sources: readonly ConsumptionEntry[],
): ConsumptionMap {
  const next: ConsumptionMap = { ...map };
  if (sources.length === 0) delete next[targetName];
  else next[targetName] = [...sources];
  return next;
}

/**
 * Build ONE source entry. Absence is decided up front for a non-guaranteed
 * value (P9 — "a source that is not guaranteed must declare what happens when
 * it is absent"), defaulting to `skip`, which is the answer the client
 * pre-flight and the server both accept without further input.
 */
export function buildEntry({
  sourceName,
  offered,
  deliver,
}: {
  sourceName: string;
  offered: OfferedValue | undefined;
  deliver: ConsumptionEntry["deliver"];
}): ConsumptionEntry {
  const entry: ConsumptionEntry = {
    mapType: "offered_value",
    target: sourceName,
    deliver,
  };
  if (offered && !offered.guaranteed) entry.when_absent = "skip";
  return entry;
}

/** Append a source. The same value twice would be the same paragraph twice. */
export function addSource(
  map: ConsumptionMap,
  targetName: string,
  {
    sourceName,
    offered,
    deliver,
  }: {
    sourceName: string;
    offered: OfferedValue | undefined;
    deliver: ConsumptionEntry["deliver"];
  },
): ConsumptionMap {
  const current = sourcesFor(map, targetName);
  if (current.some((entry) => entry.target === sourceName)) return map;
  return setSources(map, targetName, [
    ...current,
    buildEntry({ sourceName, offered, deliver }),
  ]);
}

/** Replace the source at `index` (the row component edits source 0 in place). */
export function replaceSourceAt(
  map: ConsumptionMap,
  targetName: string,
  index: number,
  entry: ConsumptionEntry,
): ConsumptionMap {
  const current = [...sourcesFor(map, targetName)];
  if (index < 0 || index > current.length) return map;
  current[index] = entry;
  return setSources(map, targetName, current);
}

export function removeSourceAt(
  map: ConsumptionMap,
  targetName: string,
  index: number,
): ConsumptionMap {
  const current = sourcesFor(map, targetName);
  return setSources(
    map,
    targetName,
    current.filter((_, i) => i !== index),
  );
}

export function moveSource(
  map: ConsumptionMap,
  targetName: string,
  index: number,
  delta: number,
): ConsumptionMap {
  const current = [...sourcesFor(map, targetName)];
  const next = index + delta;
  if (next < 0 || next >= current.length) return map;
  [current[index], current[next]] = [current[next], current[index]];
  return setSources(map, targetName, current);
}

export function patchSourceAt(
  map: ConsumptionMap,
  targetName: string,
  index: number,
  patch: Partial<ConsumptionEntry>,
): ConsumptionMap {
  const current = [...sourcesFor(map, targetName)];
  if (!current[index]) return map;
  current[index] = { ...current[index], ...patch };
  return setSources(map, targetName, current);
}

// ── The codec the VERBATIM row component talks through ───────────────────────

/**
 * The shared row renders ONE `ValueMapping`. A mandate input may be fed by
 * SEVERAL offered values (D18.2), so the row owns source **0** and the strip
 * beneath it owns the rest.
 *
 * `surface_value` is the branch the row's "offered value" mode uses — the row's
 * picker, its absence control and its Required toggle all read it. The wire
 * shape stays `offered_value`; this is a display translation, not storage.
 */
export function mappingForRow(
  sources: readonly ConsumptionEntry[],
): ValueMapping | undefined {
  const first = sources[0];
  if (!first) return undefined;
  return {
    mapType: "surface_value",
    target: first.target,
    required: first.required === true,
  };
}

/** Why this row-component pick cannot be stored on a job binding — or null. */
export function refusalForMapping(mapping: ValueMapping | null): string | null {
  if (mapping === null) return null;
  switch (mapping.mapType) {
    case "surface_value":
    case "unmapped":
    case "offered_value":
      return null;
    case "direct_value":
      return (
        "A fixed literal can't be stored on a job binding yet — a binding " +
        "delivers the values the job offers. Add the literal as a described " +
        "input on the job above, then map it here."
      );
    case "prompt_user":
      return (
        "Asking the person at launch isn't something a job binding can carry " +
        "yet — a binding delivers the values the job offers. Describe it as an " +
        "input on the job above and the run form will ask for it."
      );
    default:
      return null;
  }
}

/**
 * Apply what the shared row just produced for source 0 of one holder input.
 * Returns the next map, or a refusal naming why nothing changed — never both.
 */
export function applyRowMapping({
  map,
  targetName,
  mapping,
  offeredByName,
  deliver,
}: {
  map: ConsumptionMap;
  targetName: string;
  mapping: ValueMapping | null;
  offeredByName: ReadonlyMap<string, OfferedValue>;
  deliver: ConsumptionEntry["deliver"];
}): { map: ConsumptionMap; refusal: string | null } {
  const refusal = refusalForMapping(mapping);
  if (refusal) return { map, refusal };

  // "Holder default" (the row's `unmapped`) and a cleared row both mean: this
  // input is fed by nothing. On a job binding that is simply ABSENCE from the
  // map — there is no auto-name-match pass to suppress, so an explicit
  // suppression marker would be a stored fact with no reader.
  if (mapping === null || mapping.mapType === "unmapped") {
    return { map: setSources(map, targetName, []), refusal: null };
  }

  const sourceName =
    mapping.mapType === "surface_value" || mapping.mapType === "offered_value"
      ? mapping.target
      : "";
  const required =
    (mapping.mapType === "surface_value" ||
      mapping.mapType === "offered_value") &&
    mapping.required === true;

  const current = sourcesFor(map, targetName);
  if (!sourceName) {
    // The picker opened with nothing chosen — keep the row on "offered value"
    // by holding an empty target rather than silently reverting the mode.
    const held: ConsumptionEntry = {
      mapType: "offered_value",
      target: "",
      deliver,
    };
    return {
      map: setSources(map, targetName, [held, ...current.slice(1)]),
      refusal: null,
    };
  }

  const existing = current[0];
  const offered = offeredByName.get(sourceName);
  const base =
    existing && existing.target === sourceName
      ? existing
      : buildEntry({ sourceName, offered, deliver });

  const next: ConsumptionEntry = { ...base, target: sourceName, deliver };
  if (required) next.required = true;
  else delete next.required;

  return {
    map: setSources(map, targetName, [next, ...current.slice(1)]),
    refusal: null,
  };
}

// ── The productive empty state (P4) ──────────────────────────────────────────

export interface AutoBindSeed {
  map: ConsumptionMap;
  /** Holder inputs this pass filled in, so each row can SAY it was filled. */
  autoBound: ReadonlySet<string>;
}

/**
 * A row must never open blank when the answer is obvious. Where a holder input
 * has no stored source and the job offers a value with the SAME NAME, seed it
 * and record that we did — the row prints "chosen for you" and the author can
 * remove it. This is a DRAFT decision, visible before it is saved, which is the
 * difference between a helpful default and a silent one.
 *
 * Only exact-name matches are seeded. A fuzzier guess belongs to the AI map
 * tab, where it arrives with a confidence and a reason.
 */
export function seedAutoBinds({
  map,
  targetNames,
  offeredByName,
  deliverFor,
}: {
  map: ConsumptionMap;
  targetNames: readonly string[];
  offeredByName: ReadonlyMap<string, OfferedValue>;
  deliverFor: (targetName: string) => ConsumptionEntry["deliver"];
}): AutoBindSeed {
  let next = map;
  const autoBound = new Set<string>();
  for (const name of targetNames) {
    if (sourcesFor(next, name).length > 0) continue;
    const offered = offeredByName.get(name);
    if (!offered) continue;
    next = setSources(next, name, [
      buildEntry({ sourceName: name, offered, deliver: deliverFor(name) }),
    ]);
    autoBound.add(name);
  }
  return { map: next, autoBound };
}
