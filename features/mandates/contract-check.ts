/**
 * THE PERSISTED CONTRACT MISMATCH — read side.
 *
 * Owner ruling (Arman, 2026-09-25): a Holder whose output kind / required keys
 * / inputs do not match its mandate is SAVED — "it can warn, make things red,
 * scream and go crazy, but it cannot block"
 * (common-docs/policies/validation-offers-never-blocks.md). The server
 * (aidream `bindings.py`, `ContractCheck`) persists its verdict on the row it
 * wrote:
 *
 * - a binding: `mandate.binding.metadata.contract_check`
 * - the job's own default: `mandate.definition.metadata.default_holder_contract_check`
 *
 * and returns it on the write as `contract_check`. Every screen reads it
 * through THIS module and paints it with `ContractMismatchNotice`; nothing
 * re-derives the server's sentence.
 */

import { isJsonObject } from "@/types/json";

export interface ContractCheck {
  state: "met" | "unmet";
  problems: string[];
  expectedOutputKind: string | null;
  requiredOutputKeys: string[];
  holderType: "agent" | "workflow";
  holderName: string;
  holderOutputKind: string | null;
  holderOutputKeys: string[];
  /** Runs set this Holder aside before any provider call until it is fixed. */
  setAsideAtRun: boolean;
  /** The server's plain-words sentence: expected vs emitted, and the effect. */
  summary: string;
  checkedAt: string | null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/** Parse one `ContractCheck` (the write response or a metadata entry). */
export function parseContractCheck(raw: unknown): ContractCheck | null {
  if (!isJsonObject(raw)) return null;
  const state = raw.state;
  if (state !== "met" && state !== "unmet") return null;
  return {
    state,
    problems: strings(raw.problems),
    expectedOutputKind: text(raw.expected_output_kind),
    requiredOutputKeys: strings(raw.required_output_keys),
    holderType: raw.holder_type === "workflow" ? "workflow" : "agent",
    holderName: text(raw.holder_name) ?? "",
    holderOutputKind: text(raw.holder_output_kind),
    holderOutputKeys: strings(raw.holder_output_keys),
    setAsideAtRun: raw.set_aside_at_run === true,
    summary: text(raw.summary) ?? "",
    checkedAt: text(raw.checked_at),
  };
}

function checkFromMetadata(row: unknown, key: string): ContractCheck | null {
  if (!isJsonObject(row)) return null;
  const metadata = row.metadata;
  return isJsonObject(metadata) ? parseContractCheck(metadata[key]) : null;
}

/** A binding row's persisted verdict (`metadata.contract_check`). */
export function bindingContractCheck(row: unknown): ContractCheck | null {
  return checkFromMetadata(row, "contract_check");
}

/** The job's own default's persisted verdict. */
export function defaultHolderContractCheck(
  mandateRow: unknown,
): ContractCheck | null {
  return checkFromMetadata(mandateRow, "default_holder_contract_check");
}

/** Only the red ones. */
export function isUnmet(check: ContractCheck | null): check is ContractCheck {
  return check !== null && check.state === "unmet";
}

export interface ContractMismatch {
  /** Which rung the red row answers for, in words. */
  where: string;
  check: ContractCheck;
}

/**
 * Every red Holder on one mandate — its default and each live binding —
 * worst (set aside at run) first.
 */
export function unmetContractChecks(
  mandateRow: unknown,
  bindings: readonly unknown[],
): ContractMismatch[] {
  const found: ContractMismatch[] = [];
  const own = defaultHolderContractCheck(mandateRow);
  if (isUnmet(own)) found.push({ where: "The job's default", check: own });
  for (const binding of bindings) {
    const check = bindingContractCheck(binding);
    if (!isUnmet(check)) continue;
    const principal = isJsonObject(binding) ? binding.principal_type : null;
    found.push({
      where:
        principal === "org"
          ? "An organization's answer"
          : principal === "user"
            ? "A person's own answer"
            : "A binding",
      check,
    });
  }
  return found.sort(
    (a, b) => Number(b.check.setAsideAtRun) - Number(a.check.setAsideAtRun),
  );
}

/**
 * The client-side pre-save sentence for a declared-kind mismatch, in the same
 * words the server persists — so the red shows BEFORE the save too.
 */
export function kindMismatchProblem(
  expectedKind: string | null | undefined,
  holderKind: string | null | undefined,
): string | null {
  if (!expectedKind || !holderKind || expectedKind === holderKind) return null;
  return `Its structured output declares kind '${holderKind}', but this job answers in '${expectedKind}'.`;
}

/** The `__kind` an agent's output schema declares (const / default / 1-enum). */
export function declaredOutputKind(outputSchema: unknown): string | null {
  if (!isJsonObject(outputSchema)) return null;
  const inner = isJsonObject(outputSchema.schema)
    ? outputSchema.schema
    : outputSchema;
  const properties = isJsonObject(inner.properties) ? inner.properties : null;
  const kind =
    properties && isJsonObject(properties.__kind) ? properties.__kind : null;
  if (!kind) return null;
  if (typeof kind.const === "string") return kind.const;
  if (typeof kind.default === "string") return kind.default;
  const choices = kind.enum;
  return Array.isArray(choices) &&
    choices.length === 1 &&
    typeof choices[0] === "string"
    ? choices[0]
    : null;
}
