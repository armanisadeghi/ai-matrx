/**
 * THE RULEBOOK DOCUMENT — the Rulebook rendered once, as the bound variable
 * every Rulebook-reading agent receives BEFORE its first turn.
 *
 * 🚨 Why this file exists (Arman, 2026-08-19, on the live
 * `masterwork_conductor` blind test):
 *
 *   "why did he have to call a tool to get the rules in the first place? That
 *    makes no sense. If the path is from me creating rules to going to this
 *    agent, then the rules should just be variables that are directly fed into
 *    him… this agent should never have even started without getting the rules
 *    in place."
 *
 * The Conductor and the Scout used to receive only `rulebook_id` and were told
 * to "read it first with the rulebook tool". A document that arrives because a
 * model chose to fetch it is a document that gets SKIMMED — and the Conductor
 * admitted exactly that to the Expert. Disease D4 in
 * `common-docs/operations/agent-failure-diseases.md`.
 *
 * THE LAW THIS ENFORCES: structured content reaches an agent as a NAMED
 * VARIABLE, never as prose in the human's turn and never as a tool call the
 * model may or may not make
 * (`common-docs/systems/agent-variable-binding/FEATURE.md` § THE USER-INPUT LAW).
 *
 * ALWAYS PRESENT, EVEN WHEN BLANK. Arman: "maybe rules are so important that
 * they always have their own variable even if they're blank." A Rulebook with
 * no rules yet renders an explicit "no rules captured yet" document — never an
 * empty string, because an empty string is indistinguishable from a wiring
 * failure and reads to the model as "nothing to see".
 *
 * THE TOOL IS NOT RETIRED — it is DEMOTED. Variables substitute once, at
 * conversation start (a known platform gap, recorded in the variable-binding
 * FEATURE.md), so an agent that WRITES rules mid-conversation (the Scout) must
 * still re-read through the `rulebook` tool after its own writes. What must
 * never happen again is the FIRST read being a tool call.
 */

import {
  isPolicyRule,
  ruleActionKind,
  rulePolicyLevel,
  ruleState,
  type Rulebook,
  type RulebookRule,
} from "../types";
import { openTensions } from "../coherence/types";

/** The variable name every Rulebook-reading agent declares. */
export const RULEBOOK_DOCUMENT_VARIABLE = "rulebook_document" as const;

/** Intake answers as stored on `rulebook.metadata.intake` (tolerant read). */
function intakeLines(rulebook: Rulebook): string[] {
  const meta = rulebook.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).intake;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const intake = raw as Record<string, unknown>;
  const labels: Array<[string, string]> = [
    ["goal", "What they are trying to build"],
    ["who_runs_it", "Who will actually run it"],
    ["knowledge_lives", "Where the knowledge lives today"],
    ["stakes", "What happens if it gets it wrong"],
    ["benchmark", "The baseline they want beaten"],
    ["approach", "The Distillation Approach they picked"],
  ];
  const lines: string[] = [];
  for (const [key, label] of labels) {
    const value = intake[key];
    if (typeof value === "string" && value.trim()) {
      lines.push(`- ${label}: ${value.trim()}`);
    }
  }
  return lines;
}

function ruleBlock(rule: RulebookRule): string[] {
  const lines = [
    `### ${rule.name} [${rule.id}]`,
    `State: ${ruleState(rule)} · Severity: ${rule.severity}`,
    rule.statement,
  ];
  // 🚨 THE DECISION HALF (W58). An agent handed only `statement` for a policy
  // rule is handed a commandment where the Expert taught a judgment — the
  // whole "if → then, at this cost and this risk" is the operational form.
  if (isPolicyRule(rule)) lines.push("Kind: a DECISION, not a standing rule");
  if (rule.precondition) lines.push(`When: ${rule.precondition}`);
  if (rule.next_action) lines.push(`Then do: ${rule.next_action}`);
  const actionKind = ruleActionKind(rule);
  if (actionKind) lines.push(`Kind of move: ${actionKind}`);
  const cost = rulePolicyLevel(rule.cost);
  const risk = rulePolicyLevel(rule.risk);
  if (cost) lines.push(`Cost of the action: ${cost}`);
  if (risk) lines.push(`Risk of the action: ${risk}`);
  if (rule.rationale) lines.push(`Why: ${rule.rationale}`);
  if (rule.detection) lines.push(`Detection: ${rule.detection}`);
  if (rule.quote) lines.push(`Source words: ${rule.quote}`);
  // THE MOVE (contract §2 + W70), under the flat decision lines above: the
  // same judgment broken into the parts a machine can rank. `rule.move`, never
  // `rule.precondition` — that key is the flat string printed above.
  const when = rule.move?.when;
  if (when) {
    const parts = [`When (detail): ${when.summary}`];
    if (when.known?.length) parts.push(`known: ${when.known.join(", ")}`);
    if (when.unknown?.length)
      parts.push(`still unknown: ${when.unknown.join(", ")}`);
    if (when.counterparty_state?.length)
      parts.push(`they are: ${when.counterparty_state.join(", ")}`);
    lines.push(parts.join(" · "));
  }
  const next = rule.move?.next;
  if (next) {
    const parts = [`Next (detail): ${next.kind} ${next.target}`];
    if (next.buys) parts.push(`buys: ${next.buys}`);
    if (next.cost !== undefined) parts.push(`cost: ${next.cost} of 5`);
    if (next.risk !== undefined) parts.push(`risk: ${next.risk} of 5`);
    if (next.urgency) parts.push(`urgency: ${next.urgency}`);
    lines.push(parts.join(" · "));
  }
  if (rule.move?.ask) lines.push(`Ask, verbatim: ${rule.move.ask}`);
  if (rule.relates_to?.length) {
    for (const rel of rule.relates_to) {
      lines.push(
        `Connected: ${rel.kind} ${rel.rule_id}${rel.note ? ` — ${rel.note}` : ""}` +
          // A RETAINED DISAGREEMENT reaches the agent WITH the line the Expert
          // drew between the two positions, or it reads as a contradiction the
          // agent has to resolve on its own — which is exactly what it must not do.
          (rel.kind === "disagrees_with"
            ? rel.condition
              ? ` — when each applies: ${rel.condition}`
              : " — the Expert holds both; neither replaces the other"
            : ""),
      );
    }
  }
  if (rule.feedback) lines.push(`Review feedback: ${rule.feedback}`);
  // What this rule used to say. An agent about to rewrite it has to know it was
  // already rewritten once, and what the Expert held before.
  for (const entry of rule.history ?? []) {
    lines.push(
      `Earlier position: "${entry.statement}"${entry.reason ? ` — changed because ${entry.reason}` : ""}`,
    );
  }
  return lines;
}

/**
 * Render the COMPLETE Rulebook as the document an agent reads before it says
 * anything: identity, intake, sections, every rule with its review state, and
 * the Expert's open review feedback broken out so it cannot be missed.
 *
 * This is the ONE renderer. The Rulebook surface's `content` value uses it too
 * (`rulebookSurfaceScope.ts`) so the page's agents and the panels' agents can
 * never see two different Rulebooks.
 */
export function renderRulebookDocument(rulebook: Rulebook): string {
  const rules = rulebook.rules ?? [];
  const lines: string[] = [
    `# ${rulebook.name}`,
    rulebook.description ?? "",
    `Rulebook id: ${rulebook.id}`,
    `Status: ${rulebook.status} · Version: ${rulebook.version} · Rules: ${rules.length}`,
  ];

  const source = rulebook.source ?? {};
  const sourceBits = [
    source.title ? `title: ${source.title}` : "",
    source.author ? `author: ${source.author}` : "",
    source.year ? `year: ${source.year}` : "",
    source.provenance_url ? `url: ${source.provenance_url}` : "",
    source.note ? `note: ${source.note}` : "",
  ].filter(Boolean);
  if (sourceBits.length) lines.push(`Source — ${sourceBits.join(" · ")}`);

  const intake = intakeLines(rulebook);
  if (intake.length) {
    lines.push("\n## What the Expert said at intake", ...intake);
  }

  if (rules.length === 0) {
    // BLANK BUT PRESENT — never an empty string. See the file header.
    lines.push(
      "\n## Rules",
      "This Rulebook holds NO rules yet. That is a real, current fact about it, " +
        "not a loading state and not a wiring failure: nothing has been captured " +
        "into it so far. Do not assume rules exist that you cannot see here.",
    );
    return lines.filter(Boolean).join("\n");
  }

  const sections = rulebook.sections ?? {};
  const sectionCodes = Object.keys(sections);
  const seen = new Set<string>();
  for (const code of sectionCodes) {
    const inSection = rules.filter((rule) => rule.section === code);
    if (inSection.length === 0) continue;
    lines.push(`\n## ${sections[code]?.label ?? code} (${code})`);
    for (const rule of inSection) {
      seen.add(rule.id);
      lines.push("", ...ruleBlock(rule));
    }
  }
  const unsectioned = rules.filter((rule) => !seen.has(rule.id));
  if (unsectioned.length) {
    lines.push("\n## Not yet filed into a section");
    for (const rule of unsectioned) lines.push("", ...ruleBlock(rule));
  }

  // The Expert's open review feedback, broken out. The same payload the
  // `rulebook` tool's `read` action surfaces as `open_feedback` — an agent
  // that receives the document must not have to fetch to learn there is
  // review work waiting.
  const rejected = rules.filter((r) => r.rejected && !r.retired);
  const changeRequests = rules.filter(
    (r) => r.feedback && !r.rejected && !r.retired,
  );
  if (rejected.length || changeRequests.length) {
    lines.push(
      "\n## OPEN REVIEW FEEDBACK — the Expert is waiting on this",
      "A REJECTED rule must be rewritten per the Expert's reason (it re-queues " +
        "as a fresh draft) or withdrawn. A rule with requested changes must have " +
        "exactly that change applied; its approval state is untouched.",
    );
    for (const rule of rejected) {
      lines.push(`- REJECTED · ${rule.name} [${rule.id}] — ${rule.feedback ?? "(no reason given)"}`);
    }
    for (const rule of changeRequests) {
      lines.push(`- CHANGE REQUESTED · ${rule.name} [${rule.id}] — ${rule.feedback}`);
    }
  }

  // THE OPEN QUESTIONS (D11 · UNPARTNERED CAPTURE) — the same payload the
  // `rulebook` tool's `read` surfaces as `open_tensions`, in the document for
  // the same reason the review feedback is: an agent must not have to make a
  // tool call to learn the Expert has questions waiting. This one matters even
  // more, because these are questions to ask in the FIRST turn.
  const questions = openTensions(rulebook);
  if (questions.length) {
    lines.push(
      "\n## OPEN QUESTIONS — only the Expert can settle these",
      "Their whole rule set was read as one set, and these came out. Raise AT " +
        "MOST TWO per turn, conversationally, never as a list. Ask the question " +
        "as written, offer the options, say which you would pick. Record the " +
        "answer with `rulebook action=settle_tension` in their VERBATIM words. " +
        "Nothing waits on these — an unanswered question is not a problem, and " +
        "'it depends' is a real answer. \u{1F6A8} A contradiction between two of " +
        "their rules is NOT a defect to close: if they still hold both, settle " +
        "it as `accepted` with the condition they named (both rules are kept " +
        "and linked), or add the new position with `add_rules` linked " +
        "`disagrees_with`. Rewrite an existing rule only when they say the " +
        "earlier one was wrong.",
    );
    for (const tension of questions) {
      lines.push(
        "",
        `### ${tension.question} [${tension.id}]`,
        `Kind: ${tension.kind} · About: ${tension.rule_ids.join(", ")}`,
        ...(tension.why ? [`What goes wrong otherwise: ${tension.why}`] : []),
        ...(tension.options.length
          ? [`Options to offer: ${tension.options.map((o) => `"${o}"`).join(" | ")}`]
          : []),
        // Never a recommendation on a contradiction: "keep this one" is the
        // consensus collapse Arman's mandate forbids, and the agent repeats
        // whatever it is handed.
        ...(tension.recommendation && tension.kind !== "contradiction"
          ? [`Your recommendation: ${tension.recommendation}`]
          : []),
        ...(tension.kind === "contradiction"
          ? [
              "Both positions can stand: ask what separates them, never which " +
                "to keep.",
            ]
          : []),
      );
    }
  }

  return lines.filter(Boolean).join("\n");
}
