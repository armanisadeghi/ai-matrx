"use client";

// features/bindings/useHolderInputs.ts
//
// THE CONSUMING SIDE, for either holder type, through the canonical readers:
//
//   · an AGENT   → `buildBindingTargets` (variables ∪ context policies), the
//                  SAME util the surface binding workspace and the shortcut
//                  editor use. Context slots are first-class targets (D18.3).
//   · a WORKFLOW → `useServedRunForm`, the ONE compiled input surface the
//                  server's bind gate checks the consumption map against. Never
//                  derived from the definition here.
//
// One hook, so the workspace never branches on holder type to know what it is
// mapping onto.

import { useEffect, useMemo } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { buildBindingTargets } from "@/features/surfaces/utils/buildBindingTargets";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { useServedRunForm } from "@/features/workflow-runtime/served-form/useServedRunForm";

export type HolderRef =
  | { kind: "agent"; agentId: string | null }
  | { kind: "workflow"; workflowId: string | null };

export interface HolderInputs {
  status: "none" | "loading" | "ready" | "error";
  /** One sentence naming what went wrong — never empty-and-silent. */
  message: string | null;
  /** Every input this holder declares, in render order. */
  targets: readonly BindingTarget[];
  /** Which of those targets are CONTEXT slots rather than prompt variables. */
  contextKeys: ReadonlySet<string>;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export function useHolderInputs(holder: HolderRef): HolderInputs {
  const dispatch = useAppDispatch();

  const agentId = holder.kind === "agent" ? holder.agentId : null;
  const workflowId = holder.kind === "workflow" ? holder.workflowId : null;

  // Hooks are unconditional; each side is inert when the other holder type is
  // chosen (`useServedRunForm(null)` makes no request by contract).
  const payload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId ?? ""),
  );
  const form = useServedRunForm(workflowId);

  useEffect(() => {
    if (!agentId) return;
    void dispatch(fetchAgentExecutionMinimal(agentId));
  }, [agentId, dispatch]);

  const agentTargets = useMemo<BindingTarget[]>(() => {
    if (!agentId || !payload.isReady) return [];
    return buildBindingTargets({
      variableDefinitions: payload.variableDefinitions,
      contextPolicies: payload.contextPolicies ?? [],
    });
  }, [agentId, payload]);

  const agentContextKeys = useMemo<ReadonlySet<string>>(
    () => new Set((payload.contextPolicies ?? []).map((slot) => slot.key)),
    [payload],
  );

  const workflowTargets = useMemo<BindingTarget[]>(() => {
    if (form.status !== "ready" || !form.form.surfaceServed) return [];
    return form.form.inputs.map((input) => ({
      name: input.name,
      label: input.label || input.name,
      description: input.help || undefined,
      required: input.sourcing !== "optional",
    }));
  }, [form]);

  if (holder.kind === "workflow") {
    if (!workflowId) {
      return {
        status: "none",
        message: null,
        targets: [],
        contextKeys: EMPTY_KEYS,
      };
    }
    if (form.status === "loading") {
      return {
        status: "loading",
        message: null,
        targets: [],
        contextKeys: EMPTY_KEYS,
      };
    }
    if (form.status === "error") {
      return {
        status: "error",
        message: `The workflow's inputs could not be read: ${form.message}`,
        targets: [],
        contextKeys: EMPTY_KEYS,
      };
    }
    if (!form.form.surfaceServed) {
      return {
        status: "error",
        message:
          "The server answered without a compiled input surface, so there is nothing honest to map onto. Point at a server that serves it.",
        targets: [],
        contextKeys: EMPTY_KEYS,
      };
    }
    // A workflow input surface has no context channel — everything lands on a
    // named input.
    return {
      status: "ready",
      message: null,
      targets: workflowTargets,
      contextKeys: EMPTY_KEYS,
    };
  }

  if (!agentId) {
    return { status: "none", message: null, targets: [], contextKeys: EMPTY_KEYS };
  }
  if (!payload.isReady) {
    return {
      status: "loading",
      message: null,
      targets: [],
      contextKeys: EMPTY_KEYS,
    };
  }
  return {
    status: "ready",
    message: null,
    targets: agentTargets,
    contextKeys: agentContextKeys,
  };
}
