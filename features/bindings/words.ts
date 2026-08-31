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
      : "Nothing feeds this — the holder's own default applies.";
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
  llmOverridesHint:
    'Override the model settings for this job. Example: { "temperature": 0.2, "max_output_tokens": 1500 }',
  jsonExtractionHint:
    "How this job pulls a structured result out of the answer while it is still being written. Leave empty for off.",
};
