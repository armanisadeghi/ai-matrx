"use client";

// features/masterwork/review/useRuleImproveRun.ts
//
// THE ONE RUNNER of the `masterwork.rule_improver` Mandate.
//
// Every surface that rewrites, drafts, or tidies a rule with AI goes through
// this hook — there is no second improve path anywhere in the platform. The
// three shapes of the job are selected purely by which input is empty (the
// Mandate's own contract, documented in `agent-context/ruleImprove.ts`):
//
//   - `fields` + `expertInput`  → IMPROVE: apply the Expert's guidance.
//   - `fields: null`            → DRAFT:   author a new rule from their words.
//   - `expertInput: ""`         → TIDY:    polish the wording, change no meaning.
//
// Callers supply only what is genuinely theirs: the Rulebook context, and an
// `apply` that merges the validated result onto whatever they hold (a
// `RulebookRule`, an editor snapshot, or nothing at all). Everything else —
// the Mandate key, the variable names, the structured-output expectation, the
// timeout, the context anchor, the section validation — lives here once.
//
// 🚨 NO HARDCODED AGENTS: the Mandate key is the only agent identity named,
// and it is resolved by the database.

import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import type { HeadlessAgentJsonResult } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import {
  coerceRuleImproveResult,
  MASTERWORK_RULE_IMPROVER_MANDATE,
  type RuleImproveResult,
} from "../agent-context/ruleImprove";
import { RULE_CONTENT_FIELDS, type RulebookSections } from "../types";

/** The rule content handed to the Mandate — any rule-shaped object. */
export type RuleImproveFields = Partial<
  Record<(typeof RULE_CONTENT_FIELDS)[number], string | undefined>
>;

export interface UseRuleImproveRunConfig {
  rulebookId: string;
  organizationId: string;
  /** The Rulebook's declared sections — an invented section is rejected. */
  sections: RulebookSections;
  /** `<client>/<surface>` for surface-value resolution, when the caller has one. */
  surfaceName?: string;
}

export interface RuleImproveRunRequest<T> {
  /**
   * Distinguishes the three shapes in the run console. Convention:
   * `masterwork-rule-improve` / `masterwork-add-rule` / `masterwork-rule-tidy`
   * / `masterwork-checkup-improve`.
   */
  surfaceKey: string;
  /** The rule being rewritten; null asks for a brand-new rule. */
  fields: RuleImproveFields | null;
  /** The Expert's guidance; empty string means TIDY. */
  expertInput: string;
  /** Whatever the surface knows about the Rulebook — serialized as-is. */
  context: unknown;
  /** The section a rejected/invented section code falls back to. */
  fallbackSection: string;
  /** Merge the validated result onto what the caller holds. */
  apply: (result: RuleImproveResult) => T;
  /**
   * The durable result, when the surface persists a draft of it mid-stream
   * (the Rule Editor's wizard draft). Receives the same validated result.
   */
  onDurableResult?: (result: RuleImproveResult) => void;
  failureMessages?: { noJson?: string; timeout?: string };
}

export interface UseRuleImproveRun {
  run: <T>(request: RuleImproveRunRequest<T>) => Promise<T>;
  isRunning: boolean;
  hasLiveRun: boolean;
  conversationId: string | null;
  dismiss: () => void;
}

export function useRuleImproveRun(
  config: UseRuleImproveRunConfig,
): UseRuleImproveRun {
  const live = useLiveAgentRun();
  const { rulebookId, organizationId, sections, surfaceName } = config;

  const run = async <T,>(request: RuleImproveRunRequest<T>): Promise<T> => {
    const validate = (value: unknown) =>
      coerceRuleImproveResult(value, {
        sections,
        fallbackSection: request.fallbackSection,
      });
    return live.run<T>({
      mandateKey: MASTERWORK_RULE_IMPROVER_MANDATE,
      surfaceKey: request.surfaceKey,
      sourceFeature: "masterwork",
      ...(surfaceName ? { surfaceName } : {}),
      organizationId,
      contextAnchor: { resource_type: "rulebook", resource_id: rulebookId },
      variables: {
        rule_json: request.fields
          ? JSON.stringify(
              Object.fromEntries(
                RULE_CONTENT_FIELDS.map((field) => [
                  field,
                  request.fields?.[field] ?? "",
                ]),
              ),
            )
          : "",
        expert_input: request.expertInput.trim(),
        rulebook_context: JSON.stringify(request.context),
      },
      expect: "json",
      timeoutMs: 120_000,
      coerce: (value) => request.apply(validate(value)),
      ...(request.onDurableResult
        ? {
            onResult: (result: HeadlessAgentJsonResult) => {
              if (result.data === undefined || result.data === null) return;
              request.onDurableResult?.(validate(result.data));
            },
          }
        : {}),
      failureMessages: {
        noJson:
          request.failureMessages?.noJson ??
          "The AI finished without returning a usable rule.",
        timeout:
          request.failureMessages?.timeout ??
          "The rewrite took too long. Your rule is unchanged.",
      },
    });
  };

  return {
    run,
    isRunning: live.isRunning,
    hasLiveRun: live.hasLiveRun,
    conversationId: live.conversationId,
    dismiss: live.dismiss,
  };
}
