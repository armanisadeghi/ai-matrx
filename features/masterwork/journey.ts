// features/masterwork/journey.ts
//
// THE TOP LAYER, client side — where one Rulebook is in its life, and the ONE
// next move.
//
// 🚨 MIRROR. The server half is aidream `services/masterwork_assists/journey.py`
// and it is the system of record: the precedence below, the thresholds, and the
// headline sentences MUST match it. They are read in the same breath by the
// same Expert — the improvement brain raises a chip from `moves`, this page
// renders `headline` one line under the review bar — so the two disagreeing is
// the page telling them one thing while the chip beside it tells them another.
// Change one, change both, in the same commit.
//
// Why the journey exists (the 2026-08-19 integration audit, §2): every part of
// Masterwork Studio worked and no part knew the others existed. Nothing named
// the journey intake → distill → review → build → audition → release → encore
// → improve, so this line could only ever say "Ready to Build" — while a
// finished Checkup nobody had looked at, three unanswered questions, three
// built Masterworks and zero Auditions sat on the very same Rulebook.
//
// What this file does NOT carry: the chip copy (a chip has a verb, a confirm
// and a receipt; a line of text has none of those). That stays server-side.

import type { Rulebook, Masterwork, RulebookRule } from "./types";
import { ruleState } from "./types";
import { openTensionCount, settledTensions } from "./coherence/types";
import { readCheckupMemory } from "./checkup/service";

/** Every move the journey can name, in precedence order. */
export const JOURNEY_MOVE_KEYS = [
  "start_distilling",
  "review_drafts",
  "checkup_findings",
  "tensions_open",
  "audition_feedback",
  "conductor_ready",
  "audition_due",
  "release_ready",
  "checkup_due",
] as const;
export type JourneyMoveKey = (typeof JOURNEY_MOVE_KEYS)[number];

/** No move is true — the forever improvement loop. */
export const STEADY_STAGE = "steady";
export type JourneyStage = JourneyMoveKey | typeof STEADY_STAGE;

// The thresholds. Mirrors journey.py — same names, same numbers.
export const CHECKUP_MIN_APPROVED = 10;
export const CHECKUP_STALE_DAYS = 30;
export const CONDUCTOR_MIN_APPROVED = 8;
export const AUDITION_WEAK_BELOW = 50;
export const AUDITION_MAX_AGE_DAYS = 30;

export interface JourneyMasterwork {
  id: string;
  name: string;
  /** The free stand-in rebuilt on every save — NOT "you have a Masterwork". */
  understudy: boolean;
  releasedAt: string | null;
}

export interface JourneyAudition {
  id: string;
  createdAt: string | null;
  qualityScore: number | null;
  /** How many of the Expert's own rules plain AI beat us on. */
  lostCount: number;
  expertVerdict: string | null;
}

export interface JourneyFacts {
  rulebookId: string;
  rulebookName: string;

  liveRules: number;
  approvedRules: number;
  draftRules: number;
  rejectedRules: number;
  changeRequests: number;
  /** The ONE fact that makes "with the interviewer" honest to say. */
  hasInterviewRules: boolean;

  openTensions: number;
  settledTensions: number;

  /** When a Final Checkup last FINISHED (platform.masterwork_run). */
  latestCheckupAt: string | null;
  completedCheckups: number;
  /** When findings were last DECIDED on (metadata.checkup.last_run_at). */
  checkupSettledAt: string | null;

  masterworks: JourneyMasterwork[];
  /**
   * 🚨 THE ARCHIVED-ITEMS LAW, honesty half (row F10 repair, 2026-09-10).
   *
   * How many BUILT Masterworks this Rulebook has that are archived. A caller
   * that hands `masterworks` the LIVE half of the archive split must declare
   * the other half here, or `conductor_ready` prints "no Masterwork yet" at an
   * Expert who has two — the exact lie the law exists to kill.
   *
   * MIRROR: the server SPLIT on 2026-09-10 (aidream `27e1b8464`, row F10's open
   * aidream-lane item). `journey.py`'s `real_masterworks` is now the LIVE half
   * too — not an Understudy, not archived — `JourneyFacts.archived_masterworks`
   * is the other half, and `Journey.archived_masterworks` carries the count out
   * of the server. So there is ONE authority per surface and no drift: a client
   * computing the journey itself (this page, which reads the Rulebook's own
   * Masterworks and never calls the server for a verdict) fills this from its
   * own archive split; a surface handed a SERVER journey prints that payload's
   * `archived_masterworks` and never re-derives it here.
   */
  archivedMasterworks: number;
  latestAudition: JourneyAudition | null;

  /**
   * False for a caller that cannot see `platform.masterwork_run` (the Rulebook
   * detail page reads no runs). The run-dependent moves then stay silent
   * instead of firing on an absence nobody looked for.
   */
  hasRunFacts: boolean;
}

export interface JourneyMove {
  key: JourneyMoveKey;
  /** THE ONE LINE, in the Expert's language. */
  headline: string;
  rank: number;
}

export interface Journey {
  stage: JourneyStage;
  headline: string;
  moves: JourneyMove[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 86_400_000 : null;
}

function auditionIsWeak(a: JourneyAudition): boolean {
  return (
    a.lostCount > 0 ||
    (a.qualityScore !== null && a.qualityScore <= AUDITION_WEAK_BELOW)
  );
}

/** Where this Rulebook is, and the ONE next move. Pure and deterministic. */
export function computeJourney(
  facts: JourneyFacts,
  now: number = Date.now(),
): Journey {
  const moves: JourneyMove[] = [];
  const real = facts.masterworks.filter((m) => !m.understudy);
  const released = real.filter((m) => m.releasedAt !== null);

  // 1 — nothing to work with yet. Nothing else can be true.
  if (facts.liveRules === 0) {
    const move: JourneyMove = {
      key: "start_distilling",
      headline:
        "Start the interview — your first rules are one conversation away.",
      rank: 9,
    };
    return { stage: move.key, headline: move.headline, moves: [move] };
  }

  // 2 — rules waiting on the Expert's call. Headline only: the page renders
  // this queue, and a chip repeating the page is noise.
  const waiting =
    facts.draftRules + facts.rejectedRules + facts.changeRequests;
  if (waiting > 0) {
    let headline: string;
    if (facts.draftRules > 0) {
      const n = facts.draftRules;
      headline =
        n <= 3
          ? `Almost there — ${n} ${plural(n, "rule", "rules")} left to review.`
          : `${n} suggested ${plural(n, "rule needs", "rules need")} your call — approve, correct, or reject each one.`;
    } else if (facts.rejectedRules > 0) {
      const n = facts.rejectedRules;
      // THE HONEST COPY (audit §2). A rejected rule is rewritten by the Scout
      // on its NEXT turn — for a Rulebook built from sources with no
      // interviewer in the loop, "they're with the interviewer" was a promise
      // the system does not keep.
      headline = facts.hasInterviewRules
        ? `${n} rejected ${plural(n, "rule is", "rules are")} with the interviewer — they come back rewritten next time you talk.`
        : `${n} rejected ${plural(n, "rule", "rules")} will be rewritten the next time you talk to the interviewer.`;
    } else {
      const n = facts.changeRequests;
      headline = `${n} change ${plural(n, "request is", "requests are")} queued for the interviewer.`;
    }
    moves.push({ key: "review_drafts", headline, rank: 8 });
  }

  // 3 — a finished Checkup nobody decided on. We already paid for it.
  const checkupAge = daysSince(facts.latestCheckupAt, now);
  const settledAt = facts.checkupSettledAt
    ? new Date(facts.checkupSettledAt).getTime()
    : null;
  const checkupAt = facts.latestCheckupAt
    ? new Date(facts.latestCheckupAt).getTime()
    : null;
  const findingsWaiting =
    facts.hasRunFacts &&
    checkupAt !== null &&
    (settledAt === null || checkupAt > settledAt);
  if (findingsWaiting) {
    moves.push({
      key: "checkup_findings",
      headline:
        "A Final Checkup finished and nobody has looked at what it found.",
      rank: 9,
    });
  }

  // 4 — the questions only the Expert can settle. The Coherence Partner is
  // deliberately non-blocking, so it DEPENDS on something surfacing these.
  if (facts.openTensions > 0) {
    const n = facts.openTensions;
    moves.push({
      key: "tensions_open",
      headline: `${n} ${plural(n, "question", "questions")} only you can settle ${plural(n, "is", "are")} still open.`,
      rank: 8,
    });
  }

  // 5 — the failure lever.
  const audition = facts.latestAudition;
  const auditionFresh =
    audition === null ||
    audition.createdAt === null ||
    (daysSince(audition.createdAt, now) ?? 0) <= AUDITION_MAX_AGE_DAYS;
  if (
    facts.hasRunFacts &&
    audition !== null &&
    auditionIsWeak(audition) &&
    auditionFresh &&
    !audition.expertVerdict
  ) {
    moves.push({
      key: "audition_feedback",
      headline: "An Audition lost to plain AI — tell it what it got wrong.",
      rank: 6,
    });
  }

  // 6 — enough approved rules and NO Masterwork. The product is on the other
  // side of this one move.
  if (facts.approvedRules >= CONDUCTOR_MIN_APPROVED && real.length === 0) {
    // "no Masterwork yet" is a claim about everything this Expert has ever
    // built, so it may not be made from the LIVE half alone. With every
    // Masterwork archived the same move is still true — the Conductor can
    // build — but the sentence must name what already exists (row F10 live
    // review, 2026-09-10). Same key, same rank, same precedence: only the
    // words change. `journey.py` emits this sentence word-for-word since its
    // own archive split (aidream `27e1b8464`), so the page's line and the
    // improvement brain's chip say one thing in the all-archived state.
    const archived = facts.archivedMasterworks;
    moves.push({
      key: "conductor_ready",
      headline:
        archived > 0
          ? `${facts.approvedRules} approved rules, and all ${archived} ${plural(archived, "Masterwork is", "Masterworks are")} archived — the Conductor can build a new one.`
          : `${facts.approvedRules} approved rules and no Masterwork yet — the Conductor can build one.`,
      rank: 7,
    });
  }

  // 7 — a Masterwork nobody ever proved.
  if (facts.hasRunFacts && real.length > 0 && facts.latestAudition === null) {
    moves.push({
      key: "audition_due",
      headline: `"${real[0].name}" has never been auditioned — prove it beats plain AI.`,
      rank: 6,
    });
  }

  // 8 — proven, and still invisible to every Operator.
  const unreleased = real.filter((m) => m.releasedAt === null);
  if (
    facts.hasRunFacts &&
    unreleased.length > 0 &&
    audition !== null &&
    !auditionIsWeak(audition) &&
    released.length === 0
  ) {
    moves.push({
      key: "release_ready",
      headline: `"${unreleased[0].name}" passed its Audition and is still a draft — release it.`,
      rank: 7,
    });
  }

  // 9 — substantial and never (or not lately) checked. LAST deliberately: the
  // only move that asks the Expert to spend money with nothing already waiting.
  const checkupStale = checkupAge === null || checkupAge > CHECKUP_STALE_DAYS;
  if (
    facts.hasRunFacts &&
    facts.approvedRules >= CHECKUP_MIN_APPROVED &&
    checkupStale &&
    !findingsWaiting
  ) {
    moves.push({
      key: "checkup_due",
      headline:
        checkupAt === null
          ? `${facts.approvedRules} approved rules have never had a Final Checkup.`
          : "It has been a while since the last Final Checkup.",
      rank: 5,
    });
  }

  if (moves.length === 0) {
    return { stage: STEADY_STAGE, headline: steadyHeadline(facts), moves };
  }
  return { stage: moves[0].key, headline: moves[0].headline, moves };
}

function steadyHeadline(facts: JourneyFacts): string {
  const released = facts.masterworks.filter(
    (m) => !m.understudy && m.releasedAt !== null,
  );
  if (released.length > 0)
    return `"${released[0].name}" is released and running — keep sharpening the rules behind it.`;
  if (facts.approvedRules > 0)
    return `All caught up — ${facts.approvedRules} approved ${plural(facts.approvedRules, "rule", "rules")} and nothing waiting on you.`;
  return "No rules waiting on you.";
}

/** Rule counts in the page's own `ruleState` precedence. Mirrors `rule_counts`. */
export function ruleFacts(rules: RulebookRule[]): Pick<
  JourneyFacts,
  | "liveRules"
  | "approvedRules"
  | "draftRules"
  | "rejectedRules"
  | "changeRequests"
  | "hasInterviewRules"
> {
  let liveRules = 0;
  let approvedRules = 0;
  let draftRules = 0;
  let rejectedRules = 0;
  let changeRequests = 0;
  let hasInterviewRules = false;
  for (const rule of rules) {
    const state = ruleState(rule);
    if (state === "retired") continue;
    // Evidence is not a rule and not a question — it never moves the journey
    // (types.ts § standing). A Rulebook whose only rows are per-piece
    // observations has not started, and must not be told it is caught up.
    if (state === "evidence") continue;
    liveRules += 1;
    const ref = rule.source_ref as Record<string, unknown> | undefined;
    if (ref && (ref.approach === "interview" || ref.interview))
      hasInterviewRules = true;
    if (state === "rejected") rejectedRules += 1;
    else if (state === "draft") draftRules += 1;
    else approvedRules += 1;
    if (rule.feedback && state !== "rejected") changeRequests += 1;
  }
  return {
    liveRules,
    approvedRules,
    draftRules,
    rejectedRules,
    changeRequests,
    hasInterviewRules,
  };
}

/**
 * Build the facts from what a RULEBOOK PAGE already has in hand — no extra
 * read, no new endpoint. It sees no runs, so it declares that
 * (`hasRunFacts: false`) rather than letting the run-dependent moves fire on
 * an absence it never looked for.
 */
export function journeyFactsFromRulebook(
  rulebook: Pick<Rulebook, "id" | "name" | "rules" | "metadata">,
  masterworks: Masterwork[] = [],
  /**
   * The ARCHIVED half of the page's split. The page hands `masterworks` the
   * live half (the law: the default hides), so without this the headline
   * would claim nothing was ever built while the page's own
   * `ArchivedDisclosure` offers two.
   */
  archivedMasterworks: readonly Masterwork[] = [],
): JourneyFacts {
  const checkup = readCheckupMemory(rulebook as Rulebook);
  return {
    rulebookId: rulebook.id,
    rulebookName: rulebook.name,
    ...ruleFacts(rulebook.rules),
    // 🚨 ONE PREDICATE — the same function the panel below the headline lists
    // from (`coherence/types.ts::openTensions`). Counting `state === "open"`
    // here instead is what printed "4 questions only you can settle are still
    // open." over an empty panel on 2026-09-12: a repair had removed the rules
    // those four questions were about, and the panel dropped them while this
    // count did not. A count and a list that disagree is the screen lying.
    openTensions: openTensionCount(rulebook),
    settledTensions: settledTensions(rulebook).length,
    latestCheckupAt: null,
    completedCheckups: 0,
    checkupSettledAt: checkup.last_run_at ?? null,
    masterworks: masterworks.map((m) => ({
      id: m.id,
      name: m.name,
      understudy: m.understudy,
      releasedAt: m.released_at,
    })),
    archivedMasterworks: archivedMasterworks.filter((m) => !m.understudy)
      .length,
    latestAudition: null,
    hasRunFacts: false,
  };
}
