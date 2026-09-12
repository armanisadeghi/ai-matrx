// lib/scoped-config/ladder.ts
//
// ONE place that answers, for one key at one rung: where did this value come
// from, what happens if I clear it, may I write it at all, and if not — who
// decided and what can I do about it.
//
// Why it exists: the settings ladder's rules 3, 4, 5 and 9 are answered per
// field, on every rung, on every surface. Answering them inside each screen is
// how the same setting starts meaning different things on different pages.
// Everything here is derived from the live `platform.knob_index` contract
// (aidream 0630): the server names the chain, the origin, the lock and the
// writability; this file only turns them into sentences and a control choice.
// It never invents a rung and never re-decides a permission.

import type {
  KnobCanWriteReason,
  KnobLocked,
  KnobScopeKindName,
  KnobScopeRung,
  KnobUiHints,
  ScopedKnob,
} from "./types";

/** The control a field renders as, once hints and value type are combined. */
export type KnobControl =
  | "switch"
  | "select"
  | "segmented"
  | "slider"
  | "number"
  | "text"
  | "textarea"
  | "json"
  | "secret"
  | "model"
  | "voice";

export type KnobLadder = {
  /** Every rung the key declares, precedence ascending (nearest last). */
  rungs: KnobScopeRung[];
  /** The rung this screen edits, as the server sees it (null if not declared). */
  here: KnobScopeRung | null;
  /** True when the rung being edited holds its own (non-inert) value. */
  setHere: boolean;
  /**
   * The value as resolved AT this rung: its own value when set, otherwise the
   * nearest live value above it. A nearer rung below (this device, when the
   * screen edits "you") never leaks into this rung's row.
   */
  value: unknown;
  /** "Set here" or "Inherited from <rung>" — rule 3, verbatim. */
  originLabel: string;
  /** Human name of the rung the effective value comes from. */
  originFrom: string;
  /** Human name of the rung a clear would fall back to. */
  inheritedFrom: string;
  /** The value a clear would fall back to. */
  inheritedValue: unknown;
  /** Why this caller may not write here. `null` when they may. */
  locked: KnobLocked | null;
  /** Whether THIS caller may write at this rung (the write door's own gate). */
  canWrite: boolean;
  /** The sentence explaining a refusal — never a bare code. */
  cannotWriteBecause: string | null;
  control: KnobControl;
  ui: KnobUiHints;
  /** Section heading the field is grouped under. */
  group: string;
  /** Sort position within the group. */
  order: number;
};

/**
 * Units that are written glued to the number by convention. Everything else
 * is a separate word.
 */
const GLUED_UNITS = new Set(["%", "\u00b0", "\u00b0C", "\u00b0F", "\u00d7", "x"]);

/** A value with no answer reads as an em dash, never an empty cell. */
function valueWord(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * THE ONE value+unit formatter for every settings surface. A unit is a word,
 * not a suffix: "120 pixels", never "120pixels". Symbol units that convention
 * glues to the number ("80%", "20\u00d7") stay glued. A value with no unit, and
 * a value that is missing entirely, are formatted here too so no screen ever
 * hand-concatenates the two halves its own way.
 */
export function formatKnobValue(value: unknown, unit?: string | null): string {
  const word = valueWord(value);
  if (!unit || value === null || value === undefined) return word;
  const trimmed = unit.trim();
  if (trimmed === "") return word;
  return GLUED_UNITS.has(trimmed) ? `${word}${trimmed}` : `${word} ${trimmed}`;
}

/** Friendly, lower-case rung names. Used in sentences, so never a slug. */
const RUNG_NAMES: Record<string, string> = {
  platform: "the platform",
  organization: "your organization",
  employer_profile: "the employer profile",
  brand: "the brand",
  pay_group: "the pay group",
  site: "the site",
  location: "the location",
  user: "you",
  device: "this device",
};

export function rungName(kind: string): string {
  return RUNG_NAMES[kind] ?? kind.replace(/_/g, " ");
}

/** Title-case rung name for a badge ("Organization", "Platform"). */
export function rungTitle(kind: string): string {
  const raw =
    kind === "user" ? "personal" : kind === "device" ? "this device" : kind.replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function deriveControl(knob: ScopedKnob, ui: KnobUiHints): KnobControl {
  if (ui.control) {
    // "radio" is presented by the segmented primitive; the rest map 1:1.
    if (ui.control === "radio") return "segmented";
    return ui.control;
  }
  switch (knob.value_type) {
    case "boolean":
      return "switch";
    case "enum":
      // Two or three choices read better as one row of buttons than a menu.
      return (knob.allowed_values?.length ?? 0) <= 3 ? "segmented" : "select";
    case "number":
    case "integer":
      return knob.min_value !== null && knob.max_value !== null
        ? "slider"
        : "number";
    case "json":
      return "json";
    case "secret":
      return "secret";
    default:
      return "text";
  }
}

const CANNOT_WRITE: Record<KnobCanWriteReason, string> = {
  platform_locked:
    "The platform sets this one for everyone — it is not opened to any organization or person.",
  org_locked:
    "Your organization has turned off personal control of this setting, so its value applies to everyone here.",
  no_addressable_scope:
    "This setting is not changed from here — it is set at a scope this page is not inside.",
  not_self: "Only the person it belongs to can change a personal value.",
  not_org_admin:
    "This one is set for the whole organization. An owner or admin changes it.",
};

/**
 * Resolve one key for the rung a screen is editing.
 *
 * @param knob      the row as `platform.knob_index` returned it
 * @param scopeKind the rung this screen writes at
 * @param context   what the screen knows about the caller's role
 */
export function resolveKnobLadder(
  knob: ScopedKnob,
  scopeKind: KnobScopeKindName,
  context: { isOrgAdmin?: boolean } = {},
): KnobLadder {
  const ui = knob.ui ?? {};
  const rungs = knob.scope_chain ?? [];

  const editIndex = rungs.findIndex((rung) => rung.kind === scopeKind);
  const here = editIndex >= 0 ? rungs[editIndex] : null;
  const setHere = Boolean(here?.is_set && !here.locked);

  // Where the effective value comes from today.
  const effectiveRung = rungs.find((rung) => rung.is_effective) ?? null;
  const originFrom = rungName(effectiveRung?.kind ?? "platform");

  // The nearest rung ABOVE the one being edited that actually holds a live
  // value; the platform rung is the floor and always answers.
  const parents = (editIndex >= 0 ? rungs.slice(0, editIndex) : rungs).filter(
    (rung) => rung.is_set && !rung.locked,
  );
  const parent = parents[parents.length - 1];
  const inheritedFrom = rungName(parent?.kind ?? "platform");
  const inheritedValue = parent ? parent.value : knob.platform_default;

  // Writability. The server evaluates `can_write` for `write_rung` — the
  // nearest rung this call addressed. When this screen edits exactly that rung
  // the server's answer is used as is. When it edits a rung ABOVE it (the
  // first screen edits "you" while the call also addressed "this device"),
  // the same gate the write door applies is restated here: a personal rung is
  // self-only (this surface only ever addresses self), an organization or
  // sub-organization rung is owner/admin, and a rung the organization locked
  // refuses new values. Nothing here is looser than `knob_override_set`.
  const declared = knob.overridable_by.includes(scopeKind);
  let canWrite: boolean;
  let cannotWriteBecause: string | null = null;
  if (!declared) {
    canWrite = false;
    cannotWriteBecause = `This setting can be changed at ${knob.overridable_by
      .map(rungName)
      .join(", ")} — not here.`;
  } else if (knob.platform_locked) {
    canWrite = false;
    cannotWriteBecause = CANNOT_WRITE.platform_locked;
  } else if (here?.locked) {
    canWrite = false;
    cannotWriteBecause = knob.locked?.detail ?? CANNOT_WRITE.org_locked;
  } else if (knob.write_rung?.kind === scopeKind) {
    canWrite = knob.can_write;
    if (!canWrite) {
      cannotWriteBecause = knob.can_write_reason
        ? CANNOT_WRITE[knob.can_write_reason]
        : "This setting cannot be changed from here.";
    }
  } else if (scopeKind === "user" || scopeKind === "device") {
    canWrite = true;
  } else {
    canWrite = context.isOrgAdmin ?? false;
    if (!canWrite) cannotWriteBecause = CANNOT_WRITE.not_org_admin;
  }

  return {
    rungs,
    here,
    setHere,
    value: setHere ? here?.value : inheritedValue,
    originLabel: setHere ? "Set here" : `Inherited from ${inheritedFrom}`,
    originFrom,
    inheritedFrom,
    inheritedValue,
    locked: knob.locked ?? null,
    canWrite,
    cannotWriteBecause,
    control: deriveControl(knob, ui),
    ui,
    group: ui.group ?? knob.feature,
    order: ui.order ?? Number.MAX_SAFE_INTEGER,
  };
}

/** What sits below a rung — the numbers the blast-radius sentence names. */
export type KnobReach = {
  organizationName?: string | null;
  /** People in the organization (org rung). */
  members?: number | null;
  /** Sub-organization rows (brands, sites, pay groups, …) below the org rung. */
  subScopes?: number | null;
};

function people(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

/**
 * The sentence said BEFORE a save lands (rule 9): how far the change reaches,
 * with the counts the rung knows. Never a number pulled from thin air — a
 * count the caller does not have is left out, not guessed.
 */
export function blastRadiusFor(
  scopeKind: KnobScopeKindName,
  reach: KnobReach = {},
): string {
  const org = reach.organizationName ?? "this organization";
  switch (scopeKind) {
    case "user":
      return `Applies only to you, in ${org} — on every device you sign in from.`;
    case "device":
      return "Applies only to you, only in this browser.";
    case "organization": {
      const who =
        reach.members !== null && reach.members !== undefined
          ? `everyone in ${org} (${people(reach.members)})`
          : `everyone in ${org}`;
      const below =
        reach.subScopes !== null && reach.subScopes !== undefined && reach.subScopes > 0
          ? `, and to the ${reach.subScopes} team${reach.subScopes === 1 ? "" : "s"}, brand${reach.subScopes === 1 ? "" : "s"} and site${reach.subScopes === 1 ? "" : "s"} below it that have not set their own value`
          : ", and to everything below it that has not set its own value";
      return `Applies to ${who}${below}.`;
    }
    default:
      return `Applies to everyone under ${rungName(scopeKind)} that has not set its own value.`;
  }
}

/** Sort comparator for fields inside a group: `ui.order`, then label. */
export function compareKnobOrder(
  a: { ladder: KnobLadder; knob: ScopedKnob },
  b: { ladder: KnobLadder; knob: ScopedKnob },
): number {
  if (a.ladder.order !== b.ladder.order) return a.ladder.order - b.ladder.order;
  return a.knob.label.localeCompare(b.knob.label);
}
