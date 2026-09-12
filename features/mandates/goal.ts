// features/mandates/goal.ts
//
// THE ONE GOAL READER. Every surface that prints a Mandate's goal — or says it
// has none — resolves it here, with ONE precedence.
//
// 🚨 WHY THIS FILE EXISTS (FIX-Q9, 2026-09-11). The goal had TWO readers and
// they disagreed. The workspace read the STORED row (`agent.mandate.goal`,
// promoted post-cutover and written by `PATCH /mandates/{key}/goal`), while the
// admin goal pane read the CODE CATALOGUE only (`GET /mandates`). So a Mandate
// created in the UI — stored goal present, no code declaration — printed its
// goal on one screen and *"No goal declared for <key>."* on another, and a goal
// edited in-session stayed stale in the catalogue's page-lifetime cache until a
// full reload. Two screens, two answers, one of them a lie.
//
// THE PRECEDENCE — the one the console already used and the one the DB makes
// true: THE STORED GOAL IS THE TRUTH; the code declaration is the FALLBACK for
// a row the DB read missed, never the source. Blank and whitespace-only are not
// goals; they are absence, so a fallback still gets its turn.
//
// The absence sentence is legitimate only when BOTH are empty. Anything that
// prints it without asking both readers is the defect, returning.

/** Trim a goal; blank or whitespace-only is not a goal, it is absence. */
export function normalizeGoalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Where the goal a surface is showing actually came from. */
export type MandateGoalSource = "stored" | "catalogue" | null;

export interface ResolvedMandateGoal {
  /** The goal to print, or null when there genuinely is none. */
  goal: string | null;
  /** Which reader answered — surfaces word themselves differently. */
  source: MandateGoalSource;
}

/**
 * THE precedence, in one place: stored goal first, code catalogue as fallback.
 * Call this instead of reaching for either reader on its own.
 */
export function resolveMandateGoal(input: {
  /** `goalOfMandate(row)` — the stored `agent.mandate.goal`. */
  stored?: unknown;
  /** `catalogue[mandateKey]?.goal` — the code declaration. */
  catalogue?: unknown;
}): ResolvedMandateGoal {
  const stored = normalizeGoalText(input.stored);
  if (stored) return { goal: stored, source: "stored" };
  const declared = normalizeGoalText(input.catalogue);
  if (declared) return { goal: declared, source: "catalogue" };
  return { goal: null, source: null };
}
