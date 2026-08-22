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
// ─── WHAT CHANGED 2026-08-20 — we read STRUCTURE now, not English ───────────
//
// This module used to own an 11-pattern regex table run over `error.message`.
// Measured against all 133 failed runs live at the time: 31 hit a specific
// pattern, 59 fell into the single `invalid|validation` catch-all (wildly
// different causes, one generic sentence), and 43 matched nothing and rendered
// raw Python at the reader.
//
// The information was never missing — it was thrown away. At the moment a step
// fails the engine knows the step, the author's name for it, the field, and
// what it expected; a pydantic ValidationError literally names `sources` /
// `query` / `host_count`. The server now derives that at the raise site and
// persists it (`matrx_graph.failure`, aidream). So this module RESOLVES from
// `cause` + the fields, and generates the sentence from `step_label` + `field`
// — "Study Pack needs the material you paste in — that box was empty" comes out
// of data, with no pattern written per workflow, ever.
//
// LEGACY_PATTERNS below is exactly that old table, kept ONLY for rows written
// before the server change. It is the fallback, never the first answer. Do not
// add to it — a new cause belongs in `matrx_graph.failure.Cause` and in
// CAUSE_COPY here.
//
// Consumed by every surface that runs a workflow for a human (the Masterwork
// try-box on the Rulebook / Studio / Encore pages, the run failure card, the
// per-step readout body). A failure explained once is explained everywhere.

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
   * True when we have no specific explanation — either the server sent
   * `cause: "engine_error"` (its own honest fallback) or an old row matched no
   * legacy pattern. A surface may use it to nudge the technical detail up; a
   * rising rate of these is the signal to add a cause SERVER-SIDE.
   */
  unrecognized: boolean;
  /**
   * The ONE-CLICK way forward, when the cause has a real destination in the
   * product. A refusal the reader can only re-read is a dead end; a refusal
   * with the door attached is a task. Null when the next step is genuinely
   * "press Run again" (the button the surface already shows).
   */
  action: { label: string; href: string } | null;
  /**
   * The stable machine code the explanation resolved from, or null for a
   * legacy row explained by pattern. Surfaces MUST NOT branch on this for
   * copy — it exists for metrics and for a caller that needs to treat one
   * class specially (a stranded run offers "pick it back up", not "try again").
   */
  cause: string | null;
}

/**
 * The structured failure the server writes into `workflow.run.error` and
 * merges into `workflow.node_outcome.error`.
 *
 * Mirrors `matrx_graph.failure.RunFailure` (aidream). Every field is optional
 * here because this shape arrives as untyped jsonb from Supabase and because
 * rows written before 2026-08-20 have only `message`.
 */
export interface StructuredRunFailure {
  cause?: string | null;
  message?: string | null;
  step_id?: string | null;
  /** The AUTHOR's name for the step. Never a node id — the server omits it. */
  step_label?: string | null;
  field?: string | null;
  expected?: string | null;
  got?: string | null;
  error_type?: string | null;
  technical?: string | null;
}

/** What `explainRunFailure` accepts: the jsonb object, or a bare string. */
export type RunFailureInput =
  | StructuredRunFailure
  | Record<string, unknown>
  | string
  | null
  | undefined;

interface CauseCopy {
  /**
   * `what` is the caller's name for the thing that ran ("Your Understudy").
   * `where` is the author's name for the failing step when the server sent one.
   */
  headline: (what: string, where: string | null) => string;
  nextStep: string;
  /** Where the reader goes to clear this cause themselves. */
  action?: { label: string; href: string };
}

/**
 * cause → copy. The keys are `matrx_graph.failure.Cause` values verbatim.
 *
 * This is a MAP, not a matcher: no ordering, no first-match-wins, no ambiguity
 * about which entry a failure lands in. That is the whole difference between
 * this and the legacy table below.
 */
const CAUSE_COPY: Record<string, CauseCopy> = {
  // The server's honest "something inside us broke". NEVER "try again —
  // these usually clear": an engine defect is deterministic, and telling the
  // user to retry a deterministic failure is a lie that costs them a second
  // run and their trust (Arman hit exactly this on 2026-08-21: a KeyError
  // billed as "most of these clear on a second try" — it never could have).
  engine_error: {
    headline: (what, where) =>
      where
        ? `Something broke inside “${where}” — a fault in the system, not in what you entered.`
        : `${what} hit a fault in the system — not in what you entered.`,
    nextStep:
      "This one is on us: running it again will most likely stop at the same place. Send us the technical detail below and we'll fix the cause.",
  },
  missing_input: {
    // Headline is generated per-field by `fieldHeadline` before this is
    // consulted; this fires only when the server had no field name.
    headline: (what, where) =>
      where
        ? `${where} is missing something it needs, so ${lower(what)} couldn't start it.`
        : `${what} is missing something it needs.`,
    nextStep:
      "Open the step named below, fill in the empty box, and press Run it again. Nothing was used up.",
  },
  invalid_input: {
    headline: (what, where) =>
      where
        ? `${where} was given a value it couldn't use.`
        : `${what} was given a value it couldn't use.`,
    nextStep:
      "Check the value named below, correct it, and press Run it again. Nothing was used up.",
  },
  unresolved_variable: {
    headline: (what, where) =>
      `${where ?? what} asked for a value this run was never given.`,
    nextStep:
      "Fill in the missing value on the run form and press Run it again. If there's no box for it, tell us — a step asking for something you can't provide is our bug, not your mistake.",
  },
  definition_invalid: {
    headline: (what) => `${what} doesn't hold together yet, so it never started.`,
    nextStep:
      "This is a bug on our side, not a mistake in your rules. Send us the detail below and we'll rebuild it.",
  },
  wiring_broken: {
    headline: (what, where) =>
      where
        ? `${where} never received what the step before it was meant to hand over.`
        : `${what} broke between two steps — one never received what the one before it was meant to hand over.`,
    nextStep:
      "This is a wiring bug on our side, not a mistake in your rules. Send us the detail below and we'll reconnect it.",
  },
  expression_rejected: {
    headline: (what, where) =>
      `${where ?? what} uses a formula we won't run for safety reasons.`,
    nextStep:
      "This is a bug on our side. Send us the detail below and we'll rewrite the formula.",
  },
  no_organization: {
    headline: (what) =>
      `${what} stopped right away because it couldn't tell which workspace to run in.`,
    nextStep:
      "Pick a workspace from the switcher in the top bar and press Run it again. Nothing was used up. If you only have one workspace, reload the page and retry — this one is on us, not on you.",
  },
  consent_required: {
    headline: (what) => `${what} needs an age check on this account before AI can run.`,
    nextStep:
      "Open the Family page to declare an age or get a parent's approval — it takes under a minute, and everything unlocks automatically. Then press Run it again. Nothing was used up.",
    action: { label: "Open the Family page", href: "/education/family" },
  },
  not_authorized: {
    headline: (what) =>
      `${what} belongs to a different account, so we can't run it for you here.`,
    nextStep:
      "Sign in as the account that owns this Rulebook and try again. If it should be shared with you, ask its owner to add you.",
  },
  mandate_unresolved: {
    headline: (what, where) =>
      `${where ?? what} has no AI assigned to do the job, so there was nothing to run.`,
    nextStep:
      "This isn't something you can set from here — tell us and we'll assign one. Your rules are safe and nothing was lost.",
  },
  out_of_credits: {
    headline: (what) => `${what} stopped because this workspace is out of AI credits.`,
    nextStep:
      "Add credits under Settings → Billing, then press Run it again. Your rules and everything else are untouched.",
    action: { label: "Open Billing", href: "/dashboard/settings/billing" },
  },
  rate_limited: {
    headline: (what, where) =>
      `${where ?? what} couldn't get through — the AI provider was too busy at that moment.`,
    nextStep:
      "Wait about a minute and press Run it again. Nothing was charged for the attempt.",
  },
  content_filtered: {
    headline: () =>
      `The AI declined to do this job — something in the request tripped its safety filter.`,
    nextStep:
      "Reword the job description and run it again. If you believe the refusal is wrong, tell us — that's a rule we can push back on.",
  },
  provider_error: {
    headline: (what, where) =>
      `${where ?? what} couldn't finish — the AI provider returned an error.`,
    nextStep:
      "Press Run it again — most provider errors clear on a second try. If it happens again, send us the detail below.",
  },
  ai_output_unusable: {
    headline: (what, where) =>
      `${where ?? what} got an answer from the AI, but not in the form it needs.`,
    nextStep:
      "Press Run it again — the AI often gets it right on a second pass. If it keeps happening, tell us; a step the AI can't satisfy is ours to fix.",
  },
  output_truncated: {
    headline: (what, where) => `${where ?? what} ran out of room mid-answer and stopped short.`,
    nextStep:
      "Try again with a smaller job — fewer items, one topic. If it should fit, tell us; the ceiling is ours to raise.",
  },
  not_found: {
    headline: (what, where) =>
      `${where ?? what} looked for something that isn't there any more — it was probably rebuilt while this page was open.`,
    nextStep: "Reload the page and press Run it again.",
  },
  timed_out: {
    headline: (what, where) => `${where ?? what} ran past the time limit and was stopped.`,
    nextStep:
      "Try again with a tighter job description — one job, one audience. If it keeps timing out, tell us; a slow run is our problem to fix, not yours to work around.",
  },
  cancelled: {
    headline: (what) => `${what} was cancelled before it finished.`,
    nextStep: "Press Run it again whenever you're ready.",
  },
  child_run_failed: {
    headline: (what, where) =>
      `${where ?? what} runs another workflow inside it, and that one stopped.`,
    nextStep:
      "Open the inner run from the technical detail below to see exactly where it stopped, then press Run it again.",
  },
  persistence_failed: {
    headline: (what, where) =>
      `${where ?? what} finished its work but couldn't save the result.`,
    nextStep:
      "This is on us — the work happened, the saving didn't. Send us the detail below; don't pay to run it twice until we've looked.",
  },
  // OUR failure, never the reader's. The copy must say so plainly — this is
  // the one cause where "your run failed" would be a lie.
  run_stranded: {
    headline: () => `We dropped this run before it could finish — nothing you did caused it.`,
    nextStep:
      "Press Run it again and it should go through. Nothing was charged for the part that was lost, and your rules are untouched. If it happens twice, tell us — a dropped run is a bug on our side and we want to see it.",
  },
};

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "pasted_text" → "pasted text"; "match.id" → "match → id". */
function humanizeField(field: string): string {
  return field.replace(/_/g, " ").replace(/\./g, " → ");
}

/**
 * The per-field headline — the sentence the whole change exists to produce.
 *
 * "Study Pack needs the material you paste in — that box was empty" is
 * `step_label` + `field` + cause, assembled here. No workflow is named in this
 * file and none ever should be: a new workflow with a new required field gets
 * a correct sentence on its first failure, with nobody writing a pattern.
 */
function fieldHeadline(
  cause: string,
  where: string | null,
  what: string,
  field: string,
  expected: string | null,
): string | null {
  const subject = where ?? what;
  const name = humanizeField(field);
  if (cause === "missing_input") {
    return `${subject} needs “${name}” — that box was empty.`;
  }
  if (cause === "invalid_input") {
    return expected
      ? `${subject} couldn't use the “${name}” it was given — it expects ${expected}.`
      : `${subject} couldn't use the “${name}” it was given.`;
  }
  return null;
}

/**
 * The pre-2026-08-20 regex table. LEGACY — do not extend.
 *
 * These run over `message` for rows written before the server derived
 * structure. Every one of them is a guess at English that the server now knows
 * for a fact; each maps to the cause it was approximating, so a legacy row and
 * a new row produce the SAME copy from the SAME map. When old rows age out of
 * every surface this array can be deleted outright with no other change.
 */
const LEGACY_PATTERNS: ReadonlyArray<{ match: RegExp; cause: string }> = [
  { match: /coppa|consent[_ ]required|guardian|age[_ ]undeclared|age band/i, cause: "consent_required" },
  {
    match: /belongs to an organization|organization[_ ]id|no organization|without an organization/i,
    cause: "no_organization",
  },
  { match: /force-failed|stranded|watchdog/i, cause: "run_stranded" },
  { match: /mandate|no agent (is )?(assigned|bound)|could not resolve|unresolved agent|no holder/i, cause: "mandate_unresolved" },
  { match: /rate limit|429|overloaded|too many requests|capacity|try again later/i, cause: "rate_limited" },
  { match: /credit|quota|insufficient|billing|payment|balance|exceeded your/i, cause: "out_of_credits" },
  { match: /timed out|timeout|deadline|took too long/i, cause: "timed_out" },
  { match: /permission|not authorized|unauthorized|forbidden|403|row.level|RLS|access denied/i, cause: "not_authorized" },
  { match: /content filter|safety|blocked by|policy violation|refused to answer/i, cause: "content_filtered" },
  { match: /not found|404|does not exist|no such (workflow|definition|row)|deleted/i, cause: "not_found" },
  { match: /cancell?ed|aborted/i, cause: "cancelled" },
  // The old catch-all that swallowed 59 of 133 real failures into one generic
  // sentence. Kept last, and only for legacy rows.
  { match: /invalid|validation|schema|required field|missing input/i, cause: "invalid_input" },
];

const GENERIC_NEXT_STEP =
  "Press Run it again — most of these clear on a second try. If it stops again, send us the technical detail below and we'll fix the cause.";

function readStructured(input: RunFailureInput): StructuredRunFailure | null {
  if (!input || typeof input === "string") return null;
  const record = input as Record<string, unknown>;
  const str = (key: string): string | null => {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    cause: str("cause"),
    message: str("message"),
    step_id: str("step_id"),
    step_label: str("step_label"),
    field: str("field"),
    expected: str("expected"),
    got: str("got"),
    error_type: str("error_type"),
    technical: str("technical"),
  };
}

/**
 * The raw line we show under "Technical detail", for a payload of any age.
 *
 * `technical` is the server's dedicated field and is preferred. Older rows
 * only have `message`, which for them IS the raw text. Either way the reader
 * gets something to hand back to us — the contract says this is never dropped.
 */
function technicalLine(structured: StructuredRunFailure | null, raw: string): string | null {
  if (structured?.technical) return structured.technical;
  const cause = describeBackendFailure(raw).cause;
  return cause || raw || null;
}

/**
 * Turn a recorded run failure into something a non-technical expert can act on.
 *
 * @param input     `workflow.run.error` (the whole jsonb object — pass it
 *                  WHOLE, that is where the structure lives), a
 *                  `workflow.node_outcome.error`, a thrown error's message, or
 *                  a stream's `error_message`. A bare string still works and
 *                  takes the legacy path. `null` is legal and common — a run
 *                  can die without recording a reason, and THAT gets an honest
 *                  explanation too rather than silence.
 * @param whatItRan What the reader thinks they pressed Run on, phrased to sit
 *                  at the start of a sentence — "Your Understudy",
 *                  "Your Masterwork". Capitalised by the caller.
 */
export function explainRunFailure(
  input: RunFailureInput,
  whatItRan: string,
): RunFailureExplanation {
  const structured = readStructured(input);
  const raw = (
    typeof input === "string" ? input : (structured?.message ?? structured?.technical ?? "")
  ).trim();

  // Nothing at all: no structure, no message. Honest, and flagged as a bug we
  // want to see — a run that dies without recording a reason is our defect.
  if (!structured?.cause && !raw) {
    return {
      headline: `${whatItRan} stopped before it finished, and it didn't record a reason.`,
      nextStep:
        "Press Run it again. If it stops a second time, tell us — a failure with no reason recorded is a bug we want to see.",
      technical: null,
      unrecognized: true,
      action: null,
      cause: structured?.cause ?? null,
    };
  }

  const technical = technicalLine(structured, raw);

  // ── The structured path. ──────────────────────────────────────────────
  if (structured?.cause) {
    const where = structured.step_label ?? null;
    const copy = CAUSE_COPY[structured.cause];

    // A cause the server knows and this client doesn't (a server deployed
    // ahead of this bundle). The server's own `message` is already a human
    // sentence, so use it rather than pretending we understood nothing.
    if (!copy) {
      return {
        headline: structured.message ?? `${whatItRan} stopped partway through.`,
        nextStep: GENERIC_NEXT_STEP,
        technical,
        unrecognized: true,
        action: null,
        cause: structured.cause,
      };
    }

    const perField = structured.field
      ? fieldHeadline(
          structured.cause,
          where,
          whatItRan,
          structured.field,
          structured.expected ?? null,
        )
      : null;

    return {
      headline: perField ?? copy.headline(whatItRan, where),
      nextStep: copy.nextStep,
      technical,
      // engine_error is the server's own "we don't have a specific cause for
      // this one" — surface it as unrecognized so the rate stays visible.
      unrecognized: structured.cause === "engine_error",
      action: copy.action ?? null,
      cause: structured.cause,
    };
  }

  // ── The legacy path: a row written before the server derived structure. ──
  // Reuse the anti-secrecy primitive: it unwraps nested upstream payloads, so
  // a cause buried inside a stringified JSON body from another service still
  // reaches the patterns below.
  const haystack = `${raw}\n${describeBackendFailure(raw).cause}`;
  for (const pattern of LEGACY_PATTERNS) {
    if (!pattern.match.test(haystack)) continue;
    const copy = CAUSE_COPY[pattern.cause];
    if (!copy) continue;
    return {
      headline: copy.headline(whatItRan, null),
      nextStep: copy.nextStep,
      technical,
      unrecognized: false,
      action: copy.action ?? null,
      // Null, not the matched cause: this was inferred from prose, and a
      // metric that counted it as a known cause would overstate coverage.
      cause: null,
    };
  }

  return {
    headline: `${whatItRan} stopped partway through.`,
    nextStep: GENERIC_NEXT_STEP,
    technical,
    unrecognized: true,
    action: null,
    cause: null,
  };
}
