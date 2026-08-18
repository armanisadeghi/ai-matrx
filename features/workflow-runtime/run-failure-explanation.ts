// features/workflow-runtime/run-failure-explanation.ts
//
// THE NO-BARE-ERROR PRIMITIVE for workflow runs.
//
// `describeBackendFailure` (lib/api/errors.ts) digs out the most SPECIFIC
// technical cause a failure payload can support. That is exactly right for an
// engineer and exactly wrong for the person our product is for: a brilliant,
// non-technical Subject Matter Expert who pressed a button and got
// "ValueError: this step runs an agent, and an agent run belongs to an
// organization". This module is the other half of that journey — it turns the
// specific cause into a sentence that expert understands, plus the ONE thing
// they should do next.
//
// The rule this encodes (Arman, 2026-08-18, on the Understudy failing with no
// explanation): a failure the user can see must always say WHAT WAS BEING RUN,
// WHAT WENT WRONG in their language, and WHAT TO DO NEXT. The technical line is
// never the headline and is never hidden either — it rides along so the Expert
// can hand it to us verbatim.
//
// Consumed by every surface that runs a workflow for a human (the Masterwork
// try-box on the Rulebook / Studio / Encore pages today). Add a pattern here,
// not a bespoke string in a component — a failure explained once is explained
// everywhere.

import { describeBackendFailure } from "@/lib/api/errors";

export interface RunFailureExplanation {
  /** One plain sentence naming what was being run and what went wrong. */
  headline: string;
  /** The single next action. Always something the reader can actually do. */
  nextStep: string;
  /**
   * The raw technical cause. Never the headline, never dropped — surfaces
   * render it small/secondary so it can be copied to us verbatim.
   */
  technical: string | null;
  /**
   * True when no pattern matched, i.e. the headline is the honest "we don't
   * have a plain explanation for this one yet" fallback. A surface may use it
   * to nudge the technical detail up; a rising rate of these is the signal to
   * add a pattern below.
   */
  unrecognized: boolean;
}

interface Pattern {
  match: RegExp;
  /** `what` is the caller's name for the thing that ran ("your Understudy"). */
  headline: (what: string) => string;
  nextStep: string;
}

/**
 * First match wins, so order matters: the specific causes come before the
 * broad ones. Every entry was written for a failure we have actually seen or
 * can actually produce — this is not a guessing table.
 */
const PATTERNS: Pattern[] = [
  {
    // Seen live 2026-08-18: every UI-started run was born with no organization
    // and refused at the first agent step.
    match: /belongs to an organization|organization[_ ]id|no organization|without an organization/i,
    headline: (what) =>
      `${what} stopped right away because it couldn't tell which workspace to run in.`,
    nextStep:
      "Pick a workspace from the switcher in the top bar and press Run it again. Nothing was used up. If you only have one workspace, reload the page and retry — this one is on us, not on you.",
  },
  {
    match: /mandate|no agent (is )?(assigned|bound)|could not resolve|unresolved agent|no holder/i,
    headline: (what) =>
      `${what} has no AI assigned to do the job, so there was nothing to run.`,
    nextStep:
      "This isn't something you can set from here — tell us and we'll assign one. Your rules are safe and nothing was lost.",
  },
  {
    match: /rate limit|429|overloaded|too many requests|capacity|try again later/i,
    headline: (what) =>
      `${what} couldn't get through — the AI provider was too busy at that moment.`,
    nextStep:
      "Wait about a minute and press Run it again. Nothing was charged for the attempt.",
  },
  {
    match: /credit|quota|insufficient|billing|payment|balance|exceeded your/i,
    headline: (what) => `${what} stopped because this workspace is out of AI credits.`,
    nextStep:
      "Add credits under Settings → Billing, then press Run it again. Your rules and everything else are untouched.",
  },
  {
    match: /timed out|timeout|deadline|took too long/i,
    headline: (what) => `${what} ran past the time limit and was stopped.`,
    nextStep:
      "Try again with a tighter job description — one job, one audience. If it keeps timing out, tell us; a slow run is our problem to fix, not yours to work around.",
  },
  {
    match: /permission|not authorized|unauthorized|forbidden|403|row.level|RLS|access denied/i,
    headline: (what) =>
      `${what} belongs to a different account, so we can't run it for you here.`,
    nextStep:
      "Sign in as the account that owns this Rulebook and try again. If it should be shared with you, ask its owner to add you.",
  },
  {
    match: /content filter|safety|blocked by|policy violation|refused to answer/i,
    headline: (what) =>
      `The AI declined to do this job — something in the request tripped its safety filter.`,
    nextStep:
      "Reword the job description and run it again. If you believe the refusal is wrong, tell us — that's a rule we can push back on.",
  },
  {
    match: /not found|404|does not exist|no such (workflow|definition|row)|deleted/i,
    headline: (what) =>
      `${what} couldn't be found — it was probably rebuilt while this page was open.`,
    nextStep: "Reload the page and press Run it again.",
  },
  {
    match: /cancell?ed|aborted/i,
    headline: (what) => `${what} was cancelled before it finished.`,
    nextStep: "Press Run it again whenever you're ready.",
  },
  {
    match: /invalid|validation|schema|required field|missing input/i,
    headline: (what) =>
      `${what} was built in a way the run engine rejected, so it never started.`,
    nextStep:
      "This is a bug on our side, not a mistake in your rules. Send us the detail below and we'll rebuild it.",
  },
];

/**
 * Turn a recorded run failure into something a non-technical expert can act on.
 *
 * @param raw       `workflow.run.error.message`, a thrown error, or a stream's
 *                  `error_message`. `null` is a legal, common input — a run can
 *                  die without recording a reason, and THAT gets an honest
 *                  explanation too rather than silence.
 * @param whatItRan What the reader thinks they pressed Run on, phrased to sit
 *                  at the start of a sentence — "Your Understudy",
 *                  "Your Masterwork". Capitalised by the caller.
 */
export function explainRunFailure(
  raw: string | null | undefined,
  whatItRan: string,
): RunFailureExplanation {
  const trimmed = (raw ?? "").trim();

  if (!trimmed) {
    return {
      headline: `${whatItRan} stopped before it finished, and it didn't record a reason.`,
      nextStep:
        "Press Run it again. If it stops a second time, tell us — a failure with no reason recorded is a bug we want to see.",
      technical: null,
      unrecognized: true,
    };
  }

  // Reuse the anti-secrecy primitive: it unwraps nested upstream payloads, so
  // a cause buried inside a stringified JSON body from another service still
  // reaches the patterns below.
  const cause = describeBackendFailure(trimmed).cause;
  const haystack = `${trimmed}\n${cause}`;

  for (const pattern of PATTERNS) {
    if (pattern.match.test(haystack)) {
      return {
        headline: pattern.headline(whatItRan),
        nextStep: pattern.nextStep,
        technical: cause,
        unrecognized: false,
      };
    }
  }

  return {
    headline: `${whatItRan} stopped partway through.`,
    nextStep:
      "Press Run it again — most of these clear on a second try. If it stops again, send us the technical detail below and we'll fix the cause.",
    technical: cause,
    unrecognized: true,
  };
}
