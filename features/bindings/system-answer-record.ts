// features/bindings/system-answer-record.ts
//
// ── WHICH RECORD THE SYSTEM ANSWER IS WRITTEN TO — THE ONE PLACE THAT DECIDES ─
//
// 🚨 STORAGE IS NOT A QUESTION PUT TO A PERSON (Arman's standing default,
// FIX-R13/A, on top of D19).
//
// The admin mandate page used to ask the reader to choose between "the job's
// own default" and "a platform-wide binding" — two buttons, two paragraphs,
// one meaning. That distinction is STORAGE. FIX-R9-UI deleted the control that
// asked it, which was right, and left the page unable to create a
// platform-wide binding at all, which was not. The fix is not a third button:
// the three controls write THE SYSTEM ANSWER and the code decides the record.
//
// THE RULE, and it is the whole rule:
//
//   · a system answer that names ONLY A HOLDER is the mandate's own default —
//     `mandate.definition.default_holder_*`, three columns, no map, no
//     settings, no auto-run. It is the bottom rung and it is what "the
//     platform assigns this job to X" means with nothing else attached.
//
//   · a system answer that ALSO carries a mapping, settings or an auto-run
//     promise is a platform-wide binding — `mandate.binding` at
//     `principal_type = 'global'`. Those three things have no columns on the
//     definition, so the definition CANNOT hold that answer; writing it there
//     would silently drop what the admin just set (the fourth law).
//
//   · and once a live platform-wide binding exists it is the rung that
//     ANSWERS, so every further edit on that host goes to it. Writing the
//     definition default underneath a binding that outranks it would save a
//     row that changes nothing and report success — the exact lie this
//     campaign closes.
//
// The rule is stated for a reader on the Save button (`systemAnswerSaveWords`)
// rather than in a paragraph, because a person who is about to create a
// platform-wide row is entitled to know that is what the button does.
//
// Documented for humans in `features/mandates/FEATURE.md` § The system answer.

/**
 * IS THERE A LIVE PLATFORM-WIDE BINDING? — the one predicate, so the thing
 * that PICKS the record and the thing that decides which rung the admin page
 * stands on can never disagree about the same row.
 */
export function hasLiveGlobalBinding(
  bindings: readonly { principal_type: string; is_enabled?: boolean | null }[],
): boolean {
  return bindings.some(
    (b) => b.principal_type === "global" && b.is_enabled !== false,
  );
}

/** The two records a system answer can live in. There is no third. */
export type SystemAnswerRecord = "definition-default" | "global-binding";

export interface SystemAnswerDraft {
  /** Is there a live `principal_type = 'global'` binding on this mandate? */
  hasGlobalBinding: boolean;
  /** Does the draft map any of the job's offered values to a holder input? */
  carriesMapping: boolean;
  /** Does the draft carry captured settings overrides for the holder? */
  carriesSettings: boolean;
  /** Has the draft taken a position on auto-run? (`null` = no opinion.) */
  carriesAutoRun: boolean;
}

/**
 * THE DECISION. One function, one call site (`OneBindingWorkspace.writeBinding`
 * on the system perspective), and a guard that counts the call sites.
 */
export function systemAnswerRecord(draft: SystemAnswerDraft): SystemAnswerRecord {
  if (draft.hasGlobalBinding) return "global-binding";
  if (draft.carriesMapping || draft.carriesSettings || draft.carriesAutoRun) {
    return "global-binding";
  }
  return "definition-default";
}

/**
 * WHAT THE SAVE BUTTON SAYS. The record is not a question, but it is not a
 * secret either — a save that creates a row deciding for every user on the
 * platform names that on the control that does it. Labels, not paragraphs.
 *
 * 🚨 AND WHOSE ANSWER IT IS COMES FROM THE JOB'S HOME (FIX-R17/R-O4 — F3's
 * class, caught a fourth time by the closing lens). This button read
 * *"Set the system answer"* on an ORG-HOMED job whose own coverage line, three
 * inches above, correctly said *"every member of Write Target Sandbox"*. The
 * bottom rung of an org-homed mandate decides for ONE organization (FIX-R1), so
 * "system" there is not vocabulary drift in a button — it is the screen naming
 * the wrong blast radius on the control that causes it.
 *
 * The home is NOT re-derived here: `home` is `defaultHolderRungOffer()`'s own
 * answer, the one place on this screen that reads `mandate.definition`'s home,
 * so the label and the sentence beside it cannot disagree.
 *
 * The `global-binding` record is the exception that proves it: a
 * `principal_type = 'global'` row genuinely decides for everybody, and the
 * database refuses one on an org-homed mandate outright
 * (`mandate.guard_binding_containment`), so its words stay platform-wide.
 */
export function systemAnswerSaveWords(
  record: SystemAnswerRecord,
  {
    exists,
    home,
  }: {
    exists: boolean;
    /** `defaultHolderRungOffer()`'s reading of the job's home. */
    home: { systemHomed: boolean; homeName: string };
  },
): string {
  if (record === "global-binding") {
    return exists ? "Save the system answer" : "Set the system answer for everyone";
  }
  if (!home.systemHomed) {
    // NOT lowercased and never abbreviated: the label carries the home
    // organization's NAME, exactly as the bottom rung's own words do.
    return exists
      ? `Save ${home.homeName}'s answer`
      : `Set ${home.homeName}'s answer`;
  }
  return exists ? "Save the system answer" : "Set the system answer";
}
