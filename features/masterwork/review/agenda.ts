// features/masterwork/review/agenda.ts
//
// THE NEXT SESSION'S AGENDA — the two rows that are not "mine".
//
// Doctrine (`common-docs/systems/masterwork/doctrine/CORE.md` §5 Grading):
// "the review is mine / not mine / mine but wrong, and the last two rows are
// the next session's agenda." §7 says the same from the customer's side: the
// rule-by-rule review is "the starting point, revisited after every real run."
//
// 🚨 This is a READING of the review state that already exists, never a second
// store. A rule the Expert rejected (`rejected: true`, reason on `feedback`)
// and a rule they asked to change (`feedback` with the approval untouched) are
// exactly the two rows, and the interviewer already receives them through
// `renderRulebookDocument`'s open-feedback block and the server's
// `rulebook action=read` -> `open_feedback`. This module names them, orders
// them and gives the page one list to render.
//
// Retired rules are out: the Expert took them off the table, so they are not
// work waiting on anybody.

import { type Rulebook, type RulebookRule } from "../types";

export type AgendaKind = "not_mine" | "mine_but_wrong";

export interface AgendaItem {
  rule: RulebookRule;
  kind: AgendaKind;
  /** The Expert's own words. Empty when they said nothing beyond the verdict. */
  words: string;
}

/**
 * Every rule the Expert marked not-mine or mine-but-wrong, in that order —
 * "not mine" first because a rule that should not exist is the cheaper thing
 * to settle and the interviewer should not spend the session polishing it.
 */
export function buildReviewAgenda(rulebook: Rulebook | null): AgendaItem[] {
  const rules = rulebook?.rules ?? [];
  const live = rules.filter((rule) => rule.retired !== true);
  const notMine: AgendaItem[] = live
    .filter((rule) => rule.rejected === true)
    .map((rule) => ({
      rule,
      kind: "not_mine" as const,
      words: (rule.feedback ?? "").trim(),
    }));
  const mineButWrong: AgendaItem[] = live
    .filter((rule) => rule.rejected !== true && (rule.feedback ?? "").trim() !== "")
    .map((rule) => ({
      rule,
      kind: "mine_but_wrong" as const,
      words: (rule.feedback ?? "").trim(),
    }));
  return [...notMine, ...mineButWrong];
}

/** The agenda in each wording — the panel and the agent document share these. */
export const AGENDA_KIND_LABELS: Record<
  AgendaKind,
  { ownership: string; standard: string }
> = {
  not_mine: { ownership: "Not mine", standard: "Rejected" },
  mine_but_wrong: { ownership: "Mine but wrong", standard: "Change requested" },
};
