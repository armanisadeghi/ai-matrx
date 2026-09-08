// features/mandates/workspace/system-rung-health.ts
//
// IS THE SYSTEM'S OWN ANSWER SOUND? — the verdict the admin route exists to
// give, as a pure function, so the sentence can be tested without a database.
//
// 🚨 WHY THIS EXISTS (Arman, 2026-09-08, on `research_client.output_slides`):
// the admin route reported the mandate's real, live defect as *"No Holder
// fulfils this job yet"* — while the job HAS a system holder (the builtin
// "Research → Slides Generator") and its actual problem is that the holder
// declares no structured output while the job's consumers require `title` and
// `slides`. A screen that names the wrong defect and offers no remedy is worse
// than a blank one: it sends the reader to fix something that is not broken.
//
// The output rule is `enforced_holder_contract`'s (aidream): the OUTPUT half of
// a mandate's contract is in force always, so a holder that does not produce
// the required keys is dropped at resolution. `missingOutputKeys` is the shared
// mirror of the server's `_schema_keys` — this module only turns its answer
// into words, and never re-derives it.

export type SystemRungVerdict =
  | "ok"
  | "checking"
  | "no holder"
  | "holder unreadable"
  | "holder is a personal agent"
  | "holder archived"
  | "output contract unknown"
  | "output contract unmet";

export interface SystemRungFacts {
  /** The holder named by the definition's own defaults, or by a global binding. */
  holderName: string | null;
  holderId: string | null;
  /** `agent.definition.agent_type` — `builtin` is a system agent. */
  holderAgentType: string | null;
  holderArchived: boolean;
  /** A workflow holder — judged by the server, not by this screen. */
  holderIsWorkflow: boolean;
  /** The keys this job's consumers require (`required_output_keys`). */
  requiredOutputKeys: readonly string[];
  /**
   * Which of those the holder does NOT declare. `null` means the holder's
   * output schema has not been read yet — never "none missing".
   */
  missingOutputKeys: readonly string[] | null;
  /**
   * The holder's declared output could not be READ — a different fact from
   * "it declares nothing", and it must never be reported as one. Nothing fails
   * silently: an unanswerable check says it is unanswerable.
   */
  outputSchemaUnreadable?: boolean;
}

export interface SystemRungHealth {
  verdict: SystemRungVerdict;
  /** What is true, in one sentence. Never a hedge, never a euphemism. */
  sentence: string;
  /** What to do about it, named — `null` only when there is nothing to do. */
  remedy: string | null;
  /** `true` when the system answer cannot run as written. */
  broken: boolean;
}

function list(keys: readonly string[]): string {
  const quoted = keys.map((k) => `\`${k}\``);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

export function systemRungHealth(facts: SystemRungFacts): SystemRungHealth {
  const who = facts.holderName ?? "The system holder";

  if (!facts.holderId && !facts.holderIsWorkflow) {
    return {
      verdict: "no holder",
      sentence:
        "This job has no system holder, so nothing on the platform runs it.",
      remedy: "Assign a system agent or a workflow below.",
      broken: true,
    };
  }

  if (!facts.holderIsWorkflow && facts.holderAgentType === null) {
    return {
      verdict: "holder unreadable",
      sentence:
        "The agent this job assigns could not be read — it may be deleted, or it may not be a system agent this console can open.",
      remedy: "Assign a system agent below.",
      broken: true,
    };
  }

  if (!facts.holderIsWorkflow && facts.holderAgentType !== "builtin") {
    return {
      verdict: "holder is a personal agent",
      sentence: `${who} is a personal agent, and this job's answer is the one every user on the platform gets.`,
      remedy:
        "Duplicate it into a system agent in the system-agents admin, then assign the copy below.",
      broken: true,
    };
  }

  if (facts.holderArchived) {
    return {
      verdict: "holder archived",
      sentence: `${who} is archived, so the answer this job assigns is on its way out.`,
      remedy: "Assign a live system agent below.",
      broken: true,
    };
  }

  if (facts.requiredOutputKeys.length > 0 && facts.outputSchemaUnreadable) {
    return {
      verdict: "output contract unknown",
      sentence: `This job requires ${list(facts.requiredOutputKeys)}, and whether ${who} produces ${facts.requiredOutputKeys.length === 1 ? "it" : "them"} could not be read just now.`,
      remedy:
        "Reload the page; if it keeps failing, the agent's record is not readable from this console.",
      broken: false,
    };
  }

  if (facts.requiredOutputKeys.length > 0 && facts.missingOutputKeys === null) {
    return {
      verdict: "checking",
      sentence: `Checking whether ${who} produces ${list(facts.requiredOutputKeys)}…`,
      remedy: null,
      broken: false,
    };
  }

  const missing = facts.missingOutputKeys ?? [];
  if (missing.length > 0) {
    // 🚨 THE SENTENCE ARMAN'S CASE NEEDS, said in full: what the job requires,
    // what the holder declares, and the two doors that fix it. The old copy
    // ("No Holder fulfils this job yet") named neither the defect nor a remedy.
    const declaresNothing = missing.length === facts.requiredOutputKeys.length;
    return {
      verdict: "output contract unmet",
      sentence: declaresNothing
        ? `${who} declares no structured output, but this job requires ${list(facts.requiredOutputKeys)} — whatever reads this job's result cannot be produced, so the assignment fails at run time.`
        : `${who} does not declare ${list(missing)}, which this job requires — whatever reads this job's result cannot be produced, so the assignment fails at run time.`,
      remedy: `Give ${who} an output schema declaring ${list(facts.requiredOutputKeys)}, or assign a system agent that already does.`,
      broken: true,
    };
  }

  return {
    verdict: "ok",
    sentence: facts.holderIsWorkflow
      ? "A workflow answers this job for every user on the platform."
      : `${who} answers this job for every user on the platform.`,
    remedy: null,
    broken: false,
  };
}
