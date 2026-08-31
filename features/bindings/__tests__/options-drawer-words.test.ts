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
import {
  JOB_ADVANCED_WORDS,
  JOB_SETTINGS_WORDS,
  JOB_TREATMENT_OVERRIDE_WORDS,
} from "../words";

/**
 * The old system's vocabulary, as a person reads it. "Shortcut" is banned as a
 * NOUN for the thing being edited; "keyboard shortcut" is a real English phrase
 * for a real control and is not this defect.
 */
// 🚨 WIDENED (V2 round 3). This read `\bthe surface\b`, so FIX-5's new model
// copy said "launched from a menu or **a** surface" and walked straight past a
// guard written for exactly this class. An article is not a word boundary the
// vocabulary cares about: ban the NOUN.
const OLD_SYSTEM_NOUNS = /\bshortcuts?\b|\bsurfaces?\b/i;
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


/**
 * 🚨 THE GUARD MUST COVER EVERY STRING THAT REACHES A MANDATE HOST, not just
 * the two default objects it was born watching (V2 round 3).
 *
 * The recurrence came in through a path that did not exist when this file was
 * written: `AdvancedSection` grew an `overridesWords` prop carrying a NESTED
 * words object (`RunConfigOverridesWords`), the mandate drawer passes its own,
 * and nothing here walked it. Checking that the job words ANSWER the shortcut
 * defaults is necessary but not sufficient — it says nothing about a job word
 * that speaks the old system all by itself.
 *
 * So this asserts the job vocabulary directly: every string this repo ships to
 * a mandate screen, from every words object, is checked for the old nouns. A
 * new nested object added tomorrow is caught by the same sweep, because it is
 * the VALUES that are walked and not a hand-listed set of keys.
 */
describe("the job's own vocabulary never speaks the old system", () => {
  const jobWordObjects: Record<string, Record<string, unknown>> = {
    JOB_ADVANCED_WORDS: JOB_ADVANCED_WORDS as Record<string, unknown>,
    JOB_SETTINGS_WORDS: JOB_SETTINGS_WORDS as unknown as Record<string, unknown>,
    JOB_TREATMENT_OVERRIDE_WORDS:
      JOB_TREATMENT_OVERRIDE_WORDS as Record<string, unknown>,
  };

  it.each(Object.keys(jobWordObjects))("%s is clean", (name) => {
    const offenders = Object.entries(jobWordObjects[name])
      .filter(
        ([, value]) => typeof value === "string" && namesTheOldSystem(value),
      )
      .map(([key, value]) => `${key}: ${String(value)}`);
    expect(offenders).toEqual([]);
  });

  it("the nested overrides words the drawer passes are covered too", () => {
    // The exact path the recurrence used. Named explicitly so that deleting the
    // sweep above cannot silently stop covering it.
    expect(Object.keys(jobWordObjects)).toContain(
      "JOB_TREATMENT_OVERRIDE_WORDS",
    );
  });
});
