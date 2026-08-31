/**
 * THE GUARD ON THE OPTIONS DRAWER'S VOCABULARY (V2 finding G1, 2026-08-31).
 *
 * 🚨 A RE-OCCURRENCE of a class Arman rejected by name. The drawer mounts the
 * Gen-A shortcut editor's `SettingsSection` and `AdvancedSection` verbatim —
 * which is the point — and those components printed the OLD SYSTEM'S NOUNS on a
 * mandate screen:
 *
 *     "Override LLM parameters for this shortcut. …"
 *     "Per-key values that override what the surface ships into context policies."
 *     placeholder="What this shortcut does"
 *
 * The fix is a wording PROP with the shortcut copy as the default (never a
 * fork), and this guard is what keeps it fixed: it walks the shipped DEFAULTS,
 * finds every one that names the old system, and demands that the job words in
 * `features/bindings/words.ts` answer it. Add a new default carrying "shortcut"
 * or "the surface" tomorrow and this test fails until the job has its own word
 * for it — which is the only reason it exists.
 *
 * It fails against the pre-fix shape (no `words` prop, no job vocabulary at
 * all) and passes against this one.
 */
import {
  SHORTCUT_ADVANCED_WORDS,
  type AdvancedSectionWords,
} from "@/features/agent-shortcuts/components/next/AdvancedSection";
import {
  SHORTCUT_SETTINGS_WORDS,
  type SettingsSectionWords,
} from "@/features/agent-shortcuts/components/next/SettingsSection";
import { JOB_ADVANCED_WORDS, JOB_SETTINGS_WORDS } from "../words";

/**
 * The old system's vocabulary, as a person reads it. "Shortcut" is banned as a
 * NOUN for the thing being edited; "keyboard shortcut" is a real English phrase
 * for a real control and is not this defect.
 */
const OLD_SYSTEM_NOUNS = /\bshortcuts?\b|\bthe surface\b/i;
const ALLOWED = /keyboard shortcut/i;

const namesTheOldSystem = (copy: string): boolean =>
  OLD_SYSTEM_NOUNS.test(copy.replace(ALLOWED, ""));

/**
 * The drawer OMITS the internal-description field (`omit={["description"]}`),
 * so its placeholder never reaches a person on a job screen. It is the one
 * default the job vocabulary is allowed to leave alone — and it is listed here
 * by name, so silently omitting a second field can never sneak past this guard.
 */
const NOT_RENDERED_BY_THE_DRAWER: readonly (keyof AdvancedSectionWords)[] = [
  "descriptionPlaceholder",
];

describe("the OPTIONS drawer never speaks the old system's nouns", () => {
  it("every ADVANCED default that names the old system has a job word", () => {
    const unanswered = (
      Object.keys(SHORTCUT_ADVANCED_WORDS) as (keyof AdvancedSectionWords)[]
    ).filter(
      (key) =>
        namesTheOldSystem(SHORTCUT_ADVANCED_WORDS[key]) &&
        !NOT_RENDERED_BY_THE_DRAWER.includes(key) &&
        JOB_ADVANCED_WORDS[key] === undefined,
    );
    expect(unanswered).toEqual([]);
  });

  it("every SETTINGS default that names the old system has a job word", () => {
    const unanswered = (
      Object.keys(SHORTCUT_SETTINGS_WORDS) as (keyof SettingsSectionWords)[]
    ).filter(
      (key) =>
        namesTheOldSystem(SHORTCUT_SETTINGS_WORDS[key]) &&
        JOB_SETTINGS_WORDS[key] === undefined,
    );
    expect(unanswered).toEqual([]);
  });

  it("and no job word smuggles one back in", () => {
    const offenders = [
      ...Object.values(JOB_ADVANCED_WORDS),
      ...Object.values(JOB_SETTINGS_WORDS),
    ].filter((copy): copy is string => typeof copy === "string" && namesTheOldSystem(copy));
    expect(offenders).toEqual([]);
  });

  it("the shortcut editor's own copy is untouched — the defaults ARE the old words", () => {
    // The whole reason this is a prop and not a rewrite: passing nothing must
    // render exactly what the shortcut editor has always rendered.
    expect(SHORTCUT_ADVANCED_WORDS.llmOverridesHint).toContain(
      "for this shortcut",
    );
    expect(SHORTCUT_SETTINGS_WORDS.autoRunHint).toContain("the shortcut fires");
  });
});
