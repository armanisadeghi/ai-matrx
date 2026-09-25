// features/bindings/system-answer-record.ts
//
// ── THE SYSTEM ANSWER LIVES IN ONE RECORD: THE JOB'S OWN DEFAULT ─────────────
//
// 🚨 OWNER RULING (Arman, 2026-09-25): the answer a job gives EVERYBODY — the
// agent or workflow that runs it, its mapping, its settings and its auto-run
// promise — lives in ONE place, the mandate's own default. "If they happened
// through the UI because something is confusing, that's a massive bug — fix the
// bug before anything else."
//
// THE BUG THIS MODULE USED TO BE. Until aidream 1037 the definition default had
// no column for a map, settings or auto-run, so this module answered
// 'global-binding' the moment an admin mapped an input on the system answer:
// the admin page then wrote a platform-wide `mandate.binding` row — Holder
// included, duplicating the default — and every later edit followed that row.
// Live on 2026-09-25 that had produced four global bindings that repeated or
// replaced the default, one of them made through this screen that morning.
//
// NOW: `mandate.definition` carries `default_consumption_map`,
// `default_config_overrides` and `default_auto_run`; the default door
// (`PUT /mandates/{key}/default-holder`) stores them; the binding door refuses
// `principal_type: "global"` (409 `mandate_system_answer_is_the_default`) and
// the database refuses the row too (aidream 1041 retired the rung). So there is ONE record, and the functions
// below say so rather than choosing.
//
// Documented for humans in `features/mandates/FEATURE.md` § The system answer.

import { isJsonObject, type JsonObject } from "@/types/json";

/** The ONE record a system answer lives in. There is no second. */
export type SystemAnswerRecord = "definition-default";

export interface SystemAnswerDraft {
  /** Does the draft map any of the job's offered values to a holder input? */
  carriesMapping: boolean;
  /** Does the draft carry captured settings overrides for the holder? */
  carriesSettings: boolean;
  /** Has the draft taken a position on auto-run? (`null` = no opinion.) */
  carriesAutoRun: boolean;
}

/**
 * THE DECISION — and there is only one answer. Kept as a function (not
 * inlined) so every caller that used to branch on it now reads the same rule,
 * and the guard in `__tests__/system-answer-record.test.ts` can prove no caller
 * writes a platform-wide binding.
 */
export function systemAnswerRecord(
  _draft: SystemAnswerDraft,
): SystemAnswerRecord {
  return "definition-default";
}

/**
 * The default's own map, settings and auto-run, in the SHAPE of a binding row,
 * so the one binding parser (`parseBindingWave1`) and the one settings reader
 * read the bottom rung exactly as they read every other rung.
 */
export function defaultAnswerSettingsOf(mandate: object): {
  consumption_map: unknown;
  config_overrides: JsonObject | null;
  auto_run: boolean | null;
} {
  const row = mandate as {
    default_consumption_map?: unknown;
    default_config_overrides?: unknown;
    default_auto_run?: unknown;
  };
  return {
    consumption_map: row.default_consumption_map ?? null,
    config_overrides: isJsonObject(row.default_config_overrides)
      ? (row.default_config_overrides as JsonObject)
      : null,
    auto_run:
      typeof row.default_auto_run === "boolean" ? row.default_auto_run : null,
  };
}

/**
 * WHAT THE SAVE BUTTON SAYS. Whose answer it is comes from the job's HOME
 * (FIX-R17/R-O4): the bottom rung of an org-homed mandate decides for ONE
 * organization, so "system" there would name the wrong blast radius on the
 * control that causes it. `home` is `defaultHolderRungOffer()`'s own reading.
 */
export function systemAnswerSaveWords(
  _record: SystemAnswerRecord,
  {
    exists,
    home,
  }: {
    exists: boolean;
    /** `defaultHolderRungOffer()`'s reading of the job's home. */
    home: { systemHomed: boolean; homeName: string };
  },
): string {
  if (!home.systemHomed) {
    // NOT lowercased and never abbreviated: the label carries the home
    // organization's NAME, exactly as the bottom rung's own words do.
    return exists
      ? `Save ${home.homeName}'s answer`
      : `Set ${home.homeName}'s answer`;
  }
  return exists ? "Save the system answer" : "Set the system answer";
}
