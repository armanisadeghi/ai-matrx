// features/vision-interview/group-chat/policy.ts
//
// A Group Chat participant's view policy (aidream `services/group_chat/models.ViewPolicy`) as
// the inspector's compact controls read and write it. Pure. The server is strict — an invalid
// policy is a 422, never clamped — so `policyProblem` names what the controls would send wrong
// BEFORE it is sent, and the save is held until it is fixed.

import type { components } from "@ai-matrx/agents/generated/api-types";

export type ViewPolicy = components["schemas"]["ViewPolicy"];
export type GroupParticipant = components["schemas"]["Participant"];
export type ParticipantOut = components["schemas"]["ParticipantOut"];
export type GroupChatOut = components["schemas"]["GroupChatOut"];

/** The person's speaker key (`models.PERSON_KEY`). */
export const PERSON_KEY = "person";
export const MIN_BUDGET_CHARS = 1_000;
export const MAX_BUDGET_CHARS = 48_000;
export const DEFAULT_BUDGET_CHARS = 12_000;

export type SeesMode = "everyone" | "none" | "only" | "except";
export type RevealMode = "always" | "after_round" | "every_rounds";
export type CadenceMode = "person" | "every_rounds";

/** The policy with every server default filled in (`{}` = sees everyone, by name). */
export interface FullPolicy {
  sees: SeesMode;
  /** The keys `only` / `except` name (empty for everyone / none). */
  seesKeys: string[];
  labels: "named" | "anonymous";
  reveal: RevealMode;
  revealRounds: number | null;
  cadence: CadenceMode;
  cadenceRounds: number | null;
  budgetChars: number;
}

export function readPolicy(policy: ViewPolicy | null | undefined): FullPolicy {
  const p = policy ?? {};
  const sees = p.sees ?? "everyone";
  let mode: SeesMode = "everyone";
  let keys: string[] = [];
  if (sees === "none") mode = "none";
  else if (typeof sees === "object" && sees && "only" in sees) {
    mode = "only";
    keys = [...sees.only];
  } else if (typeof sees === "object" && sees && "except" in sees) {
    mode = "except";
    keys = [...sees.except];
  }
  const reveal = p.reveal ?? null;
  const cadence = p.cadence ?? "person";
  return {
    sees: mode,
    seesKeys: keys,
    labels: p.labels ?? "named",
    reveal: !reveal ? "always" : "after_round" in reveal ? "after_round" : "every_rounds",
    revealRounds: !reveal ? null : "after_round" in reveal ? reveal.after_round : reveal.every_rounds,
    cadence: cadence === "person" ? "person" : "every_rounds",
    cadenceRounds: cadence === "person" ? null : cadence.every_rounds,
    budgetChars: p.budget_chars ?? DEFAULT_BUDGET_CHARS,
  };
}

/** The wire policy the controls describe — every field explicit, so the server stores what is shown. */
export function writePolicy(full: FullPolicy): ViewPolicy {
  const sees: ViewPolicy["sees"] =
    full.sees === "only"
      ? { only: full.seesKeys }
      : full.sees === "except"
        ? { except: full.seesKeys }
        : full.sees;
  const rounds = (n: number | null) => n ?? 1;
  return {
    sees,
    labels: full.labels,
    reveal:
      full.reveal === "always"
        ? null
        : full.reveal === "after_round"
          ? { after_round: rounds(full.revealRounds) }
          : { every_rounds: rounds(full.revealRounds) },
    cadence: full.cadence === "person" ? "person" : { every_rounds: rounds(full.cadenceRounds) },
    budget_chars: full.budgetChars,
  };
}

/** What the server would refuse in these controls, in a few words — or null when it is sendable. */
export function policyProblem(full: FullPolicy, groupKeys: readonly string[]): string | null {
  if ((full.sees === "only" || full.sees === "except") && full.seesKeys.length === 0) return "Pick who";
  const known = new Set([...groupKeys, PERSON_KEY]);
  if (full.seesKeys.some((key) => !known.has(key))) return "Not in this group";
  const roundsOk = (n: number | null) => n != null && Number.isInteger(n) && n >= 1 && n <= 10_000;
  if (full.reveal !== "always" && !roundsOk(full.revealRounds)) return "Rounds 1–10000";
  if (full.cadence !== "person" && !roundsOk(full.cadenceRounds)) return "Rounds 1–10000";
  if (!Number.isInteger(full.budgetChars) || full.budgetChars < MIN_BUDGET_CHARS || full.budgetChars > MAX_BUDGET_CHARS) {
    return "Budget 1k–48k";
  }
  return null;
}

/** A participant row's name: "Adversary" or "Adversary · full view". */
export function participantName(p: Pick<GroupParticipant, "label" | "instance_label">): string {
  return p.instance_label ? `${p.label} · ${p.instance_label}` : p.label;
}
