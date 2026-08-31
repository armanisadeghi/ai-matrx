// features/bindings/consumption-writer.ts
//
// 🚨 THE ONE WRITER for a mandate binding's consumption map.
//
// Every edit the one binding UI makes to a draft map goes through a function in
// this file. Nothing else in `features/bindings/` constructs a ConsumptionEntry
// or mutates a ConsumptionMap. That is deliberate: the map's SHAPE keeps moving
// (D18.2 landed many-to-one on 2026-08-31; the two missing sources landed the
// same day), and a shape change must be one file's worth of work, never a sweep
// through the UI. It has been exactly that twice now.
//
// The shape written here is the CURRENT one, verbatim from
// `features/mandates/provision-shapes.ts`:
//
//   ConsumptionMap = Record<holderInputName, ConsumptionEntry[]>
//   ConsumptionEntry = the offered_value | direct_value | prompt_user branches
//                      of the shared `ValueMapping`, each carrying `deliver`.
//
// ── THE FOUR SOURCES ─────────────────────────────────────────────────────────
// The shared row component offers `Holder Default | Offered Value | Direct
// Value | Prompt User`, and a job binding now carries all four for real:
//
//   · Holder Default — ABSENCE from the map. There is nothing to store: a job
//     binding has no auto-name-match pass to suppress, so an explicit
//     suppression marker would be a stored fact with no reader.
//   · Offered Value  — `offered_value`, the job's own offer.
//   · Direct Value   — `direct_value`, a literal written on the binding.
//   · Prompt User    — `prompt_user`. The mandate's input surface serves that
//     target as a real named field, so the run form asks the question and the
//     answer arrives under the holder input's own name.
//
// 🚨 THE STOPGAP THAT WAS HERE IS GONE. Until 2026-08-31 the server's
// consumption-map validator accepted `offered_value` and nothing else, so this
// module answered a Direct Value or Prompt User pick with `refusalForMapping`
// — a stand-in that screamed in domain words instead of writing something the
// save would 422 on. `aidream/services/mandates/provisions.py` now validates
// AND materializes all three, so the stand-in is DELETED, not disabled: no
// flag, no dead branch, no second path.

import type { ValueMapping } from "@/features/surfaces/types";
import {
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";

/** The one source kind that names something the JOB offers. */
type OfferedSource = Extract<ConsumptionEntry, { mapType: "offered_value" }>;

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
}): OfferedSource {
  const entry: OfferedSource = {
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
  if (
    current.some(
      (entry) => entry.mapType === "offered_value" && entry.target === sourceName,
    )
  )
    return map;
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

/**
 * Patch fields ON THE SOURCE AT `index`, within its own branch.
 *
 * A patch never changes what KIND of source this is — swapping an offered value
 * for a literal is a different pick, made through the row, not a field edit. So
 * the patch is typed to the source's own branch and applied to it, which is
 * what keeps `{...entry, ...patch}` from producing a shape no branch has.
 */
export function patchSourceAt<E extends ConsumptionEntry>(
  map: ConsumptionMap,
  targetName: string,
  index: number,
  patch: Partial<E>,
): ConsumptionMap {
  const current = [...sourcesFor(map, targetName)];
  const existing = current[index];
  if (!existing) return map;
  current[index] = { ...existing, ...patch } as ConsumptionEntry;
  return setSources(map, targetName, current);
}

// ── The codec the VERBATIM row component talks through ───────────────────────

/**
 * The shared row renders ONE `ValueMapping`. A mandate input may be fed by
 * SEVERAL sources (D18.2), so the row owns source **0** and the strip beneath
 * it owns the rest.
 *
 * `surface_value` is the branch the row's "offered value" mode uses — the row's
 * picker, its absence control and its Required toggle all read it. The wire
 * shape stays `offered_value`; that is a display translation, not storage. The
 * other two travel through unchanged, because the row's Direct Value and Prompt
 * User modes ARE the stored shapes.
 */
export function mappingForRow(
  sources: readonly ConsumptionEntry[],
): ValueMapping | undefined {
  const first = sources[0];
  if (!first) return undefined;
  if (first.mapType === "direct_value") {
    return { mapType: "direct_value", target: first.target };
  }
  if (first.mapType === "prompt_user") {
    return {
      mapType: "prompt_user",
      prompt: first.prompt,
      defaultValue: first.defaultValue,
      required: first.required === true,
    };
  }
  return {
    mapType: "surface_value",
    target: first.target,
    required: first.required === true,
  };
}

/**
 * One source, as the shared row just described it — or null when the row means
 * "the holder's own default", which is absence and not an entry.
 *
 * THE ONE CONSTRUCTOR for the two sources that are the binding's own content.
 * `deliver` is stamped from the TARGET, never from the pick, because the
 * channel is a property of the input being fed and every source feeding one
 * input must agree on it (the server refuses a target whose sources disagree).
 */
export function entryFromRowMapping({
  mapping,
  offeredByName,
  deliver,
  existing,
}: {
  mapping: ValueMapping | null;
  offeredByName: ReadonlyMap<string, OfferedValue>;
  deliver: ConsumptionEntry["deliver"];
  /** The source this replaces, so an unrelated edit keeps its absence answer. */
  existing?: ConsumptionEntry;
}): ConsumptionEntry | null {
  if (mapping === null || mapping.mapType === "unmapped") return null;

  if (mapping.mapType === "direct_value") {
    return { mapType: "direct_value", target: mapping.target ?? "", deliver };
  }
  if (mapping.mapType === "prompt_user") {
    const entry: Extract<ConsumptionEntry, { mapType: "prompt_user" }> = {
      mapType: "prompt_user",
      prompt: mapping.prompt,
      deliver,
    };
    if (mapping.required === true) entry.required = true;
    if (mapping.defaultValue !== undefined && mapping.defaultValue !== null) {
      entry.defaultValue = mapping.defaultValue;
    }
    return entry;
  }

  const sourceName =
    mapping.mapType === "surface_value" || mapping.mapType === "offered_value"
      ? mapping.target
      : "";
  if (!sourceName) {
    // The picker opened with nothing chosen — hold an empty target rather than
    // silently reverting the mode, so the row stays where the person put it and
    // says what it is still waiting for.
    return { mapType: "offered_value", target: "", deliver };
  }
  const base: OfferedSource =
    existing && existing.mapType === "offered_value" && existing.target === sourceName
      ? existing
      : buildEntry({
          sourceName,
          offered: offeredByName.get(sourceName),
          deliver,
        });
  const next: OfferedSource = { ...base, target: sourceName, deliver };
  if (mapping.required === true) next.required = true;
  else delete next.required;
  return next;
}

/**
 * Apply what the shared row just produced for source 0 of one holder input.
 *
 * Returns the next map. There is no refusal branch any more — every source the
 * row can produce is a source a job binding can store.
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
}): ConsumptionMap {
  const current = sourcesFor(map, targetName);
  const next = entryFromRowMapping({
    mapping,
    offeredByName,
    deliver,
    existing: current[0],
  });
  // "Holder default" (the row's `unmapped`) and a cleared row both mean: this
  // input is fed by nothing. On a job binding that is simply ABSENCE from the
  // map, so the WHOLE target goes — including any joined extras, which existed
  // only to be joined onto a source that is now gone.
  if (next === null) return setSources(map, targetName, []);
  return setSources(map, targetName, [next, ...current.slice(1)]);
}

// ── THE AI MAP'S ACCEPT (P11) ────────────────────────────────────────────────

/**
 * Turn an accepted AI proposal into a draft map — through this seam, like every
 * other edit.
 *
 * NEVER APPLIED BLIND: this runs only after a person pressed "Use this
 * configuration", and what it produces fills the MANUAL editor, which the host
 * then switches to. Every line stays editable before anything is saved.
 *
 * Two rules the proposal does not get to break:
 *   · a target the holder does not have is not a target (the parser already
 *     discarded and reported those; this is the second gate, because a stale
 *     `targets` list is the one way an invention could still land);
 *   · D18.2 combinations arrive as `alsoFrom` and are appended in the proposal's
 *     order, which IS the order they will be joined in.
 *
 * Returns the untouched map when the proposal maps nothing, so accepting a
 * policies-only answer can never wipe what is already there.
 */
export function applySuggestions({
  map,
  suggestions,
  targetNames,
  offeredByName,
  deliverFor,
}: {
  map: ConsumptionMap;
  suggestions: readonly {
    target: string;
    mapping: ValueMapping;
    alsoFrom: string[];
  }[];
  targetNames: readonly string[];
  offeredByName: ReadonlyMap<string, OfferedValue>;
  deliverFor: (targetName: string) => ConsumptionEntry["deliver"];
}): ConsumptionMap {
  const known = new Set(targetNames);
  let next = map;
  for (const suggestion of suggestions) {
    if (!known.has(suggestion.target)) continue;
    const deliver = deliverFor(suggestion.target);
    const first = entryFromRowMapping({
      mapping: suggestion.mapping,
      offeredByName,
      deliver,
    });
    if (first === null) {
      // The proposal said "leave this on the holder's own default" — that is a
      // real decision, and absence is how it is stored.
      next = setSources(next, suggestion.target, []);
      continue;
    }
    next = setSources(next, suggestion.target, [first]);
    for (const also of suggestion.alsoFrom) {
      next = addSource(next, suggestion.target, {
        sourceName: also,
        offered: offeredByName.get(also),
        deliver,
      });
    }
  }
  return next;
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
