"use client";

/**
 * useBindingHealth — is the agent you bound still ALLOWED to run this mandate?
 *
 * THE PROBLEM THIS EXISTS FOR. A binding is contract-checked when you WRITE it
 * (aidream's bind endpoint + the picker's pre-flight), and again on every
 * resolution by the server. But the mandate's `contract` is owned by CODE:
 * `sync_declared_mandates` rewrites it from the declaration on every aidream
 * boot. So a mandate you validly bound on Monday can require a new variable on
 * Wednesday, and from that moment `resolve_mandate` DROPS your override and
 * silently runs the system agent instead (services/mandates/service.py — the
 * override layer is dropped loudly in the SERVER LOG and resolution continues).
 *
 * That fallback is correct and deliberate: a stale personal binding must never
 * fail a user's request. What was missing is the other half — telling the
 * person. Until this hook, `/agents/mandates` mirrored only the runtime's
 * PRECEDENCE and not its CONTRACT CHECK, so a dropped binding still rendered as
 * "Yours" with the user's agent name. The UI asserted that a customization was
 * running when the server had already stopped running it.
 *
 * WHAT COUNTS AS A BREAKING CHANGE is not a guess here — it is exactly the
 * server's own rule, run against the same stored contract: the bound agent must
 * declare a SUPERSET of the mandate's required variables and context policy
 * keys (`compareStoredContract`). Adding a required variable to a mandate
 * breaks every binding whose agent lacks it; renaming one breaks them the same
 * way. Widening a mandate (dropping a requirement) never breaks anything.
 *
 * Only BOUND agents are fetched (one canonical `fetchAgentExecutionMinimal`
 * per distinct agent, deduped, cached by the slice) — bindings are rare, so
 * this is a handful of reads, not a fan-out over the whole mandate registry.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { compareStoredContract } from "./contract-compare";
// The leaf module, not ./overrides — same reason contract.ts exists at all:
// service.ts needs the shape too, and importing it via ./overrides is a cycle.
import type { MandateContract } from "./contract";

/** One bound (mandate, agent) pair to verify. */
export interface BoundAgentRef {
  mandateId: string;
  agentId: string;
  contract: MandateContract;
  /** Which layer bound it — only for the message the user reads. */
  layer: "user" | "org";
}

export interface BindingVerdict {
  /** False = the server is dropping this binding and running the default. */
  passing: boolean;
  /** Contract names the bound agent does not declare. */
  missing: string[];
  layer: "user" | "org";
  /** True until the agent's declaration has actually been read. */
  checking: boolean;
  /** The agent could not be read at all (deleted, or no longer shared). */
  unreadable: boolean;
}

export function useBindingHealth(
  refs: BoundAgentRef[],
): Record<string, BindingVerdict> {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [checkedAt, setCheckedAt] = useState(0);

  // Distinct agent ids, stable across renders so the effect doesn't re-fire on
  // every parent render (refs is rebuilt by a useMemo upstream).
  const agentIds = useMemo(
    () => [...new Set(refs.map((r) => r.agentId))].sort().join(","),
    [refs],
  );

  useEffect(() => {
    if (!agentIds) return;
    let cancelled = false;
    const ids = agentIds.split(",");
    // Settled, not all — one unreadable agent must not hide every other
    // verdict. An unreadable agent is itself a finding (rendered below).
    void Promise.allSettled(
      ids.map((id) => dispatch(fetchAgentExecutionMinimal(id)).unwrap()),
    ).then(() => {
      if (!cancelled) setCheckedAt(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [agentIds, dispatch]);

  return useMemo(() => {
    const out: Record<string, BindingVerdict> = {};
    // checkedAt is a deliberate dependency: the payloads it reads live in the
    // store, so the memo must recompute once the fetches settle.
    void checkedAt;
    for (const ref of refs) {
      const payload = selectAgentExecutionPayload(store.getState(), ref.agentId);
      if (!payload.isReady) {
        out[ref.mandateId] = {
          passing: true, // never accuse an agent we simply haven't read yet
          missing: [],
          layer: ref.layer,
          checking: checkedAt === 0,
          unreadable: checkedAt !== 0,
        };
        continue;
      }
      const check = compareStoredContract(ref.contract, {
        variableNames: (payload.variableDefinitions ?? []).map((v) => v.name),
        contextPolicyKeys: (payload.contextPolicies ?? []).map((s) => s.key),
      });
      out[ref.mandateId] = {
        passing: check.passing,
        missing: [...check.missingVariables, ...check.missingPolicies].map(
          (r) => r.name,
        ),
        layer: ref.layer,
        checking: false,
        unreadable: false,
      };
    }
    return out;
  }, [refs, store, checkedAt]);
}
