"use client";

// features/messaging/lib/useMessagingIntelligences.ts
//
// IDENTITY INJECTION for `@ai-matrx/messaging`'s four conversation
// intelligences — and nothing else (C22). The package owns every behaviour: the
// chips, what rides `variables`, the transcript window, the streaming render,
// what "catch me up" means. This hook answers only two host questions:
//
//   WHO fulfils each job  → the Mandate system (`useMandateSet`), which returns
//                           the resolved Holder AND its `config_overrides`.
//                           BOTH halves are injected: resolving a mandate and
//                           passing only the agent id silently drops the
//                           settings half of whatever binding decided it.
//   HOW MUCH history      → the org/user-configurable knob, not the package's
//                           hardcoded 200 (opinions become knobs).
//
// 🚨 NO FALLBACK. A mandate that will not resolve leaves its capability OUT of
// the identity map, and the package then does not render that chip at all — an
// absent affordance, never a dead button, and never a hardcoded agent id
// standing in. `unresolved` names the ones that refused so the host can say so
// where saying so belongs (the Agents menu / diagnostics), never on the page.

import { useMemo } from "react";
import type {
  MessagingAgentIdentity,
  MessagingAgents,
} from "@ai-matrx/messaging/react";
import { useMandateSet } from "@/features/mandates/useMandateSet";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import {
  MESSAGING_AI_KNOB_FEATURE,
  MESSAGING_AI_TRANSCRIPT_CAP_KEY,
  MESSAGING_MANDATE_KEYS,
  MESSAGING_MANDATE_KEY_LIST,
  type MessagingCapability,
} from "./messagingMandates";

/**
 * The mandate resolver already narrows a binding's `config_overrides` to the
 * generated LLMParams shape (`features/mandates/llm-params.ts`), which is a
 * closed set of scalars and enums. This is the last step to the wire type the
 * package sends: same values, JSON-shaped. A key that is somehow NOT a scalar
 * is dropped LOUDLY rather than serialized into something the server would
 * reject — the same posture `toLlmParams` takes one layer up.
 */
function toWireOverrides(
  mandateKey: string,
  overrides: Readonly<Record<string, unknown>> | null,
): Record<string, string | number | boolean> | null {
  if (overrides === null) return null;
  const out: Record<string, string | number | boolean> = {};
  const dropped: string[] = [];
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      return;
    }
    dropped.push(key);
  });
  if (dropped.length > 0) {
    console.warn(
      `[messaging] mandate ${mandateKey} binding carries non-scalar ` +
        `config_overrides keys that were not sent: ${dropped.join(", ")}. ` +
        "Extend features/mandates/llm-params.ts, or apply them server-side.",
    );
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface MessagingIntelligences {
  /** Only the capabilities whose mandate resolved. Never a partial identity. */
  agents: MessagingAgents;
  /** The resolved knob, or undefined while it loads (the package keeps its default). */
  maxTranscriptMessages: number | undefined;
  /** Mandate keys that refused, with the reason. For diagnostics, not the page. */
  unresolved: readonly { mandateKey: string; reason: string }[];
}

export function useMessagingIntelligences(options: {
  organizationId: string | null | undefined;
  userId: string | null | undefined;
}): MessagingIntelligences {
  const { organizationId, userId } = options;
  const mandates = useMandateSet(MESSAGING_MANDATE_KEY_LIST);

  const knobs = useScopedKnobs({
    organizationId,
    featurePrefix: MESSAGING_AI_KNOB_FEATURE,
    ...(userId ? { userId } : {}),
  });

  const cap = useMemo(() => {
    const row = knobs.knobs.find(
      (knob) =>
        knob.feature === MESSAGING_AI_KNOB_FEATURE &&
        knob.key === MESSAGING_AI_TRANSCRIPT_CAP_KEY,
    );
    // `origin: "missing"` means the register has no such key — a real error the
    // knob system already surfaces on its own surfaces. Here it simply means we
    // have no number to inject, so the package keeps its documented default
    // rather than the host inventing one.
    if (row === undefined || row.origin === "missing") return undefined;
    const value = row.effective_value;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }, [knobs.knobs]);

  return useMemo(() => {
    const agents: { -readonly [K in MessagingCapability]?: MessagingAgentIdentity } =
      {};
    const unresolved: { mandateKey: string; reason: string }[] = [];

    (Object.keys(MESSAGING_MANDATE_KEYS) as MessagingCapability[]).forEach(
      (capability) => {
        const mandateKey = MESSAGING_MANDATE_KEYS[capability];
        const state = mandates[mandateKey];
        if (state === undefined || state.loading) return;
        if (state.mandate === null) {
          unresolved.push({
            mandateKey,
            reason:
              state.error ??
              "No Holder is bound to this job yet — bind one at /mandates.",
          });
          return;
        }
        agents[capability] = {
          agentId: state.mandate.agentId,
          // The settings half of the winning binding. `null` is passed through
          // as "the agent's own settings stand"; the package omits the field.
          configOverrides: toWireOverrides(
            mandateKey,
            state.mandate.configOverrides,
          ),
        };
      },
    );

    return { agents, maxTranscriptMessages: cap, unresolved };
  }, [mandates, cap]);
}
