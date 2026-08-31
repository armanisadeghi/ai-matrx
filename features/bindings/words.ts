// features/bindings/words.ts
//
// THE ONE BINDING UI'S VOCABULARY — in one file, because a screen that calls a
// thing by two names is lying about one of them.
//
// The mechanics are shared with the surface bind panel and the shortcut batch
// grid; the WORDS are this domain's. A job binding consumes an OFFERED value,
// never a "surface value", and the word "shortcut" never appears on a mandate
// screen — Arman rejected B1's first ship partly for leaking it.

import type { SourceLabels } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { AdvancedSectionWords } from "@/features/agent-shortcuts/components/next/AdvancedSection";
import type { SettingsSectionWords } from "@/features/agent-shortcuts/components/next/SettingsSection";
import {
  isOfferedSource,
  type ConsumptionEntry,
} from "@/features/mandates/provision-shapes";

/** The four sources, in this domain's words, for either holder type. */
export function sourceLabelsFor(
  holderKind: "agent" | "workflow",
): Required<SourceLabels> {
  return {
    agent_default:
      holderKind === "workflow" ? "Holder Default" : "Agent Default",
    surface_value: "Offered Value",
    direct_value: "Direct Value",
    prompt_user: "Prompt User",
  };
}

/**
 * P17.4 — what fill-down promises and what it cannot promise, said BEFORE the
 * button is pressed. The mandate half of the shortcut grid's own sentence: a
 * literal or a question is the binding's own content and carries everywhere,
 * while an offered value only exists where a value of that name is offered.
 */
export const FILL_DOWN_LIMITS =
  "Direct values, questions and holder defaults fill cleanly. An offered value only lands where that place offers a value of the same name — elsewhere the row re-binds to a value named like the input, or clears and goes red.";

/**
 * WHAT FEEDS ONE HOLDER INPUT, SAID BY KIND (V1 finding F2, 2026-08-31).
 *
 * 🚨 The rail used to print "Fed by N offered value(s)" off a RAW SOURCE COUNT,
 * so it was false in two of the four source kinds and in the unfinished-pick
 * state: a fixed value and a question are the binding's OWN content, not
 * anything this job offers, and an offered source whose value has not been
 * picked yet feeds nothing at all — the same draft state the row itself calls
 * "Pick which offered value feeds this input" and the save refuses over. The
 * adversary caught the rail claiming "Fed by 1 offered value." over a stored
 * literal while the offered column, correctly, called every offered value
 * unused on the same screen.
 *
 * So the sentence is derived from the sources THEMSELVES, kind by kind, and it
 * never asserts a kind it has not checked. A screen is absent or honest.
 */
export function feedSentence(
  sources: readonly ConsumptionEntry[] | undefined,
  /**
   * Whether the HOLDER supplies its own value for this input. Required, not
   * optional-defaulting-to-true: a default of `true` is exactly the assumption
   * that made this sentence lie (V2 round 3).
   */
  holderHasDefault: boolean,
): string {
  const all = sources ?? [];
  // An offered source with no value picked is an UNFINISHED CHOICE. It is not
  // a feed, and counting it as one is exactly the lie F2 named.
  const unpicked = all.filter(
    (e) => isOfferedSource(e) && e.target === "",
  ).length;
  const settled = all.filter((e) => !(isOfferedSource(e) && e.target === ""));

  if (settled.length === 0) {
    return unpicked > 0
      ? unpicked === 1
        ? "Waiting for you to pick which offered value feeds this — nothing feeds it yet."
        : `Waiting for you to pick ${unpicked} offered values — nothing feeds this yet.`
      : holderHasDefault
        ? "Nothing feeds this — the holder's own default applies."
        : "Nothing feeds this, and the holder has no default of its own — nothing arrives for it.";
  }

  const offered = settled.filter(isOfferedSource).length;
  const literals = settled.filter((e) => e.mapType === "direct_value").length;
  const questions = settled.filter((e) => e.mapType === "prompt_user").length;

  const parts: string[] = [];
  if (offered > 0)
    parts.push(offered === 1 ? "1 offered value" : `${offered} offered values`);
  if (literals > 0)
    parts.push(literals === 1 ? "a fixed value" : `${literals} fixed values`);
  if (questions > 0)
    parts.push(
      questions === 1
        ? "a question the person answers"
        : `${questions} questions the person answers`,
    );

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  const tail =
    unpicked > 0
      ? unpicked === 1
        ? " One more source is still waiting for you to pick its offered value."
        : ` ${unpicked} more sources are still waiting for you to pick their offered values.`
      : "";

  return settled.length === 1
    ? `Fed by ${list}.${tail}`
    : `Fed by ${list}, joined in order.${tail}`;
}

/**
 * WHAT THIS JOB'S OFFER ACTUALLY COVERS — the JOB cell's own content
 * (V2 finding G3, round 2, 2026-08-31; the plan's wireframe, §"PLACE").
 *
 * 🚨 The JOB cell held an identity, two badges and a provenance line — about
 * 110px of content in a row the holder cell stretched to ~400px, so it measured
 * 71% empty and two adversarial rounds called that dead space by name. The
 * wireframe always said what belongs there: not padding, but whether what this
 * job offers is ENOUGH — "Offers 60 values — enough to feed every input below
 * without asking the user anything."
 *
 * Every clause is derived from the draft map and the holder's own inputs, and
 * nothing is asserted about a state that has not been read: no holder, inputs
 * still loading and a holder that declares nothing each get their own sentence
 * rather than a coverage claim about nothing.
 */
export function coverageLine({
  hasHolder,
  inputsReady,
  totalInputs,
  fedInputs,
  askingInputs,
  unfedRequired,
  offeredCount,
}: {
  hasHolder: boolean;
  inputsReady: boolean;
  totalInputs: number;
  fedInputs: number;
  askingInputs: number;
  unfedRequired: number;
  offeredCount: number | null;
}): string {
  if (!hasHolder) {
    return offeredCount === null
      ? "Pick a holder and this job's offered values become its inputs."
      : offeredCount === 0
        ? "This job offers nothing yet, so a holder here would run on what its caller passes and nothing else."
        : `Pick a holder and these ${offeredCount} offered values become the inputs it can be fed from.`;
  }
  if (!inputsReady) return "Reading what this holder needs…";
  if (totalInputs === 0) {
    return "This holder declares no inputs, so there is nothing on this screen to feed.";
  }

  const head =
    fedInputs === totalInputs
      ? `Every input this holder needs is fed — all ${totalInputs}.`
      : `${fedInputs} of the ${totalInputs} inputs this holder needs ${
          fedInputs === 1 ? "is" : "are"
        } fed.`;

  const asks =
    askingInputs > 0
      ? askingInputs === 1
        ? " One of them asks the person at run time."
        : ` ${askingInputs} of them ask the person at run time.`
      : "";

  const blocked =
    unfedRequired > 0
      ? unfedRequired === 1
        ? " 1 required input is still unmapped, and a run would refuse."
        : ` ${unfedRequired} required inputs are still unmapped, and a run would refuse.`
      : "";

  const slack =
    unfedRequired === 0 && fedInputs < totalInputs
      ? ` The other ${totalInputs - fedInputs} fall back to the holder's own defaults.`
      : "";

  return `${head}${asks}${blocked}${slack}`;
}

/** Does anything actually feed this input right now? (The rail's highlight.) */
export function isFed(sources: readonly ConsumptionEntry[] | undefined): boolean {
  return (sources ?? []).some((e) => !(isOfferedSource(e) && e.target === ""));
}

/**
 * THE OPTIONS DRAWER'S NOUNS (V2 finding G1, 2026-08-31).
 *
 * 🚨 A RE-OCCURRENCE of the class Arman rejected by name. The drawer mounts the
 * shortcut editor's own `SettingsSection` + `AdvancedSection` verbatim, and
 * those components printed "shortcut" and "the surface" — on a MANDATE screen,
 * to a person who has never seen the old system. They also printed developer
 * vocabulary a Subject Matter Expert has no use for ("NULL = off. See
 * JsonExtractionConfig"). The fix is the same one the shared binding row and
 * the AI-map tab already use: a wording PROP with the shortcut copy as the
 * default, so the shortcut editor is untouched and this file — the one place
 * this UI keeps its vocabulary — supplies the job's words.
 */
export const JOB_SETTINGS_WORDS: SettingsSectionWords = {
  autoRunHint: "Submit the agent automatically when the job fires.",
};

export const JOB_ADVANCED_WORDS: Partial<AdvancedSectionWords> = {
  heading: "Advanced",
  hint: "Rarely needed, never lost.",
  activeTitle: "Offer this job's own options",
  activeHint:
    "Off keeps everything here stored but unused — the job falls back to the platform's default presentation.",
  iconHint: "Pick the icon this job wears wherever it appears.",
  iconPlaceholder: "e.g. Flame, Rocket",
  contextOverridesHint:
    "Per-key values that override what this job supplies into context policies.",
  // 🚨 TWO SETTINGS SURFACES SIT ON THIS SCREEN, AND THEY ARE NOT THE SAME
  // ROW. This one is the job's OWN options (`mandate.treatment.config`), which
  // is what a menu/surface launch reads — the shortcut face of the same record.
  // The one under "Settings" above is the BINDING's (`mandate.binding
  // .config_overrides`), which is what the mandate run door applies, per rung
  // and server-side. Neither is dead and neither covers the other, so each
  // names its own reach rather than letting the person assume one control.
  // (That they are two stores at all is the D5/D7 split; it is not this wave's
  // to unify, but it is this wave's not to lie about.)
  llmOverridesHint:
    "Which model runs this job, and the settings it runs with, when it is launched from a menu or from a place in the app. Stored with this job's own options, so it is one answer for everyone — options have no per-person rung. Left alone, the holder's own model and settings are used. (Runs through the job itself use the binding's own settings, under Settings above.)",
  jsonExtractionHint:
    "How this job pulls a structured result out of the answer while it is still being written. Leave empty for off.",
};

/**
 * 🚨 THE OVERRIDES PANEL, TOLD WHERE IT IS (VISION-RECONCILIATION B14).
 *
 * `RunConfigOverrides` is the canonical settings-override editor and it is
 * mounted here unchanged — but it was mounted with ITS host's words, so a
 * binding screen printed *"Overrides apply to this conversation only"* about a
 * row that is stored and applies to every run of this job, for everybody the
 * rung covers. Arman found it; the sentence was simply false. Same wording-prop
 * discipline as everything else in this file.
 */
export const JOB_OVERRIDE_WORDS = {
  heading: "Model settings for this binding",
  scopeNote:
    "These are stored on this binding and applied by the server on every run of this job, for everyone this rung covers — not to one conversation. Resetting a value hands it back to the holder's own default.",
  noModelNote:
    "No model resolved for this holder yet — its settings appear once it is read.",
};

/**
 * The OTHER settings surface on this screen, and the reason both must name
 * their own reach: this one is the job's own options
 * (`mandate.treatment.config`), which a menu or surface launch reads;
 * `JOB_OVERRIDE_WORDS` above is the binding row the mandate run door applies.
 * Two live controls, two different doors — see `JOB_ADVANCED_WORDS
 * .llmOverridesHint`.
 */
export const JOB_TREATMENT_OVERRIDE_WORDS = {
  heading: "Model settings for this job's own options",
  scopeNote:
    "These are stored with this job's options and used when it is launched from a menu or from a place in the app. One answer for everyone — options have no per-person rung. Resetting a value hands it back to the holder's own default.",
  noModelNote:
    "No model chosen — this job runs on its holder's own model unless you pick one.",
};
