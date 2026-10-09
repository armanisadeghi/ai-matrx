// features/question-desk/identityBanner.ts
//
// What the "this interview is not addressed to you" banner says. On the ADMIN
// seat (/administration/question-desk/**) the person is an admin READING someone
// else's interview, not a respondent who signed in to the wrong account — so the
// banner says plainly that admins are reading, and drops the "switch accounts"
// instruction that would send an admin away from the page they are meant to use.
// Answering is unchanged: the database still decides who may answer.

export const ADMIN_READING_LABEL = "Admin view: you are reading this interview.";

export function identityBannerText(identitySentence: string, adminSeat: boolean): string {
  if (adminSeat) {
    return `${ADMIN_READING_LABEL} ${identitySentence} Answers are refused unless this account holds an editor grant.`;
  }
  return `${identitySentence} Answers from this account are refused by the database unless it holds an editor grant on this interview \u2014 switch accounts before answering.`;
}
