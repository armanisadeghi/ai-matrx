// features/masterwork/probe/service.ts
//
// THE BAD EXAMPLE PROBE — the client half's pure part: the wire shape, the
// parser, the sentences, and the knobs this lane obeys.
//
// Server half: `aidream/aidream/services/distillation/probe.py`
// (`POST /masterworks/probe`). Doctrine:
// `common-docs/systems/masterwork/doctrine/CORE.md` §5, Acquisition — negative
// space and boundary hunting.
//
// THE SESSION LIVES HERE, NOT ON THE SERVER. Every round is one HTTP call, and
// the request carries the rounds so far, because the screen is the only thing
// that knows what the Expert has actually seen. That is what makes a probe
// resumable in the ordinary way — a durable run pointer and a rejoin — instead
// of needing a bespoke session row nothing else in Masterwork has.

import type { paths } from "@/types/python-generated/api-types";

/**
 * Served by `aidream/aidream/services/distillation/probe.py`.
 *
 * Cast pending the OpenAPI type sync, the precedent the unfolding and
 * prediction lanes both set: `pnpm sync-types` needs a machine with database
 * access. Until it runs, a wrong path fails LOUDLY with the real HTTP error
 * and everything else on this screen stays typed. Remedy: `pnpm sync-types`.
 */
export const PROBE_PATH = "/masterworks/probe" as keyof paths;

/** The feature these knobs belong to — registered by migration 0714. */
export const PROBE_KNOB_FEATURE = "masterwork.bad_example_probe";

/**
 * The values the knobs START at, declared here so a missing row degrades into
 * a visible warning rather than a broken screen. NOT a fallback the system
 * settles into: the banner names the problem every time it is used.
 */
export const DECLARED_KNOB_DEFAULTS = {
  rounds: 5,
  voice_default_on: true,
};

/** One round of a probe session, exactly as the wire carries it. */
export interface ProbeRound {
  example_title: string;
  example_body: string;
  /**
   * The boundary this variant probed, as the generator named it. Carried back
   * so a later round cannot re-probe covered ground.
   *
   * 🚨 NEVER RENDERED BESIDE THE EXAMPLE. Naming the ground we are testing is
   * one hint short of naming the flaw, and a probe whose answer is on screen
   * is not a probe. It is session state, not a label.
   */
  probe_label: string;
  /** The Expert's own words. Empty until they answer this round. */
  critique: string;
}

/** The terminal `masterwork_probe_round` payload. */
export interface ProbeRoundResult {
  rulebookId: string;
  rulebookVersion: number;
  roundIndex: number;
  roundCount: number;
  done: boolean;
  doneReason: string;
  exampleTitle: string;
  exampleBody: string;
  probeLabel: string;
  rulesAdded: number;
  ruleIds: string[];
  duplicatesSkipped: number;
  quotesVerified: number;
  quotesUnverified: number;
  alreadyDistilled: boolean;
  answeredRounds: number;
}

/**
 * Narrow the terminal document, or reject it loudly.
 *
 * `round_index` is the discriminator: a payload without one is not a probe
 * round, and adopting it would leave the screen showing the previous round's
 * example beside the next round's counts.
 */
export function parseProbeRound(raw: unknown): ProbeRoundResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!("round_index" in data) || !("round_count" in data)) return null;
  const ids = Array.isArray(data.rule_ids) ? data.rule_ids : [];
  const already = Array.isArray(data.already_distilled)
    ? data.already_distilled
    : [];
  return {
    rulebookId: String(data.rulebook_id ?? ""),
    rulebookVersion: Number(data.rulebook_version ?? 0),
    roundIndex: Number(data.round_index ?? 0),
    roundCount: Number(data.round_count ?? 0),
    done: Boolean(data.done),
    doneReason: String(data.done_reason ?? ""),
    exampleTitle: String(data.example_title ?? ""),
    exampleBody: String(data.example_body ?? ""),
    probeLabel: String(data.probe_label ?? ""),
    rulesAdded: Number(data.rules_added ?? 0),
    ruleIds: ids.map((id) => String(id)),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    quotesVerified: Number(data.quotes_verified ?? 0),
    quotesUnverified: Number(data.quotes_unverified ?? 0),
    alreadyDistilled: already.length > 0,
    answeredRounds: Number(data.answered_rounds ?? 0),
  };
}

/**
 * What the last answer was worth, in the Expert's words.
 *
 * ZERO IS AN HONEST ANSWER AND SAYS SO. A catch that carried no reusable
 * judgment writes no rule, and the screen has to be able to say that without
 * reading as a failure — otherwise the Expert learns to pad their answers.
 */
export function describeCatch(result: ProbeRoundResult): string | null {
  if (result.alreadyDistilled) {
    return (
      "We had already turned that answer into rules, so nothing was added a " +
      "second time. Your rules from it are on the Rulebook."
    );
  }
  if (result.answeredRounds === 0) return null;
  if (result.rulesAdded === 0) {
    return (
      "Nothing new came out of that one — either it is already one of your " +
      "rules, or what you said was about this one piece rather than a rule " +
      "you would apply again. Both are fine; keep going."
    );
  }
  const plural = result.rulesAdded === 1 ? "rule" : "rules";
  const skipped = result.duplicatesSkipped
    ? `, skipping ${result.duplicatesSkipped} you already have`
    : "";
  const unverified = result.quotesUnverified
    ? ` ${result.quotesUnverified} could not be matched word-for-word to what you said and is flagged for you to check.`
    : "";
  return (
    `That answer became ${result.rulesAdded} draft ${plural}${skipped} — ` +
    `waiting on the Rulebook for you to approve.${unverified}`
  );
}

/** The request body for one round. */
export interface ProbeRequestBody extends Record<string, unknown> {
  rulebook_id: string;
  case_brief: string;
  rounds: ProbeRound[];
  finish: boolean;
  round_cap?: number;
  source_note?: string;
}

/**
 * THE ONE PLACE the wire body is built — the screen and its guard both go
 * through it, the precedent `buildTimelineRequest` set on the timeline lane.
 *
 * `finish` and the rounds are the whole contract: the server distils the LAST
 * round's critique and then decides whether to write another variant, so a
 * screen that sent the rounds in the wrong order, or dropped an unanswered
 * one, would silently re-probe ground the Expert already closed.
 */
export function buildProbeRequest(input: {
  rulebookId: string;
  caseBrief: string;
  rounds: ProbeRound[];
  finish: boolean;
  roundCap?: number;
}): ProbeRequestBody {
  const body: ProbeRequestBody = {
    rulebook_id: input.rulebookId,
    case_brief: input.caseBrief.trim(),
    rounds: input.rounds.map((round) => ({
      example_title: round.example_title,
      example_body: round.example_body,
      probe_label: round.probe_label,
      critique: round.critique,
    })),
    finish: input.finish,
    source_note: input.caseBrief.trim().slice(0, 300),
  };
  if (input.roundCap) body.round_cap = input.roundCap;
  return body;
}

/** What is still missing before a probe can start, each a next step. */
export function validateCaseBrief(caseBrief: string): string | null {
  const brief = caseBrief.trim();
  if (!brief) {
    // PHRASED AS AN INSTRUCTION, NOT A COMPLAINT. These sentences are the
    // `reason` on the gated start button, where a person who has not typed
    // yet reads them on the screen's FIRST paint — so they are short next
    // steps, and they are never dressed as an error.
    return "Say what kind of work to fake first";
  }
  if (brief.length < 10) {
    return "A few more words, so we can write something like your real work";
  }
  return null;
}

/**
 * The rounds already answered, read back off the run's receipt.
 *
 * A probe session lives in mount-local state and the durable row carries only
 * the round in flight, so a reload mid-round-2 used to lose round 1 entirely —
 * the example, the Expert's own words about it, the lot (cold walk 6, finding
 * 3, 2026-09-17). The launch now writes them onto the receipt and this reads
 * them back. A receipt is untrusted input like anything else out of storage:
 * anything that is not a well-formed list of rounds yields nothing rather than
 * a half-built session, and the screen carries on with what the server sends.
 */
export function parsePriorRounds(raw: string): ProbeRound[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rounds: ProbeRound[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.example_body !== "string" || !row.example_body) return [];
    rounds.push({
      example_title: typeof row.example_title === "string" ? row.example_title : "",
      example_body: row.example_body,
      probe_label: typeof row.probe_label === "string" ? row.probe_label : "",
      critique: typeof row.critique === "string" ? row.critique : "",
    });
  }
  return rounds;
}
