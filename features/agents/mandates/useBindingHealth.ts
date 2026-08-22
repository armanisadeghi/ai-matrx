"use client";

/**
 * useBindingHealth — is the agent you bound still doing this job the way the
 * server will actually run it?
 *
 * THE PROBLEM THIS EXISTS FOR. A binding is contract-checked when you WRITE it
 * (aidream's bind endpoint + the picker's pre-flight). But the mandate's
 * contract AND its Provision are owned by CODE — `sync_declared_mandates` /
 * `sync_declared_provisions` rewrite them on every aidream boot. So a binding
 * that was valid on Monday can stop fitting on Wednesday, and nothing told the
 * person who made it. Until this hook, `/agents/mandates` mirrored only the
 * runtime's PRECEDENCE, so a binding the server had stopped honouring still
 * rendered as "Yours".
 *
 * TWO ERAS, TWO RULES — exactly the server's own rules, never a guess:
 *
 * 1. LEGACY mandate (no `provision_key`). The server drops an override whose
 *    agent does not declare a SUPERSET of `contract.required_variables` /
 *    `required_context_policies` (`resolve_mandate` → `_agent_ref_contract_
 *    problems`) and runs the SYSTEM DEFAULT instead. Verdict kind `dropped`:
 *    "your agent isn't running; the built-in one is."
 *
 * 2. PROVISION mandate (`provision_key` set — the normal case since
 *    2026-08-22). The holder is NEVER checked against the input side; the
 *    binding's `consumption_map` is checked at BIND time only ("everything
 *    consumed must be offered"). If the Provision later stops offering a value
 *    the binding consumes, the server does NOT drop the binding — your agent
 *    still runs, it just no longer receives that value. Verdict kind
 *    `stale_inputs`: "your agent is running but X no longer reaches it."
 *    (`compareConsumptionAgainstOffer` — the provision-era compare.)
 *
 * Unused offered values are NORMAL and never a finding (the bind rule).
 * Only BOUND agents are fetched (legacy era only), deduped, cached by the slice.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import {
  compareConsumptionAgainstOffer,
  compareStoredContract,
} from "./contract-compare";
// Leaf modules, not ./overrides — service.ts needs these shapes too, and
// importing them via ./overrides is a cycle.
import type { MandateContract } from "./contract";
import type { ConsumptionMap } from "./provision-shapes";

/** One bound (mandate, agent) pair to verify. */
export interface BoundAgentRef {
  mandateId: string;
  agentId: string;
  contract: MandateContract;
  /** Which layer bound it — only for the message the user reads. */
  layer: "user" | "org";
  /** Provision era: the mandate's provision key (null = legacy mandate). */
  provisionKey: string | null;
  /** Provision era: the offer's value names — null while the offer is still
   * loading (never accuse a binding before the offer has been read). */
  offeredValueNames: string[] | null;
  /** Provision era: what the deciding binding consumes. */
  consumptionMap: ConsumptionMap;
}

export interface BindingVerdict {
  /** False = something the user set up is not happening as they believe. */
  passing: boolean;
  /**
   * dropped      — legacy rule failed; the server runs the SYSTEM DEFAULT.
   * stale_inputs — provision rule failed; the bound agent still runs but the
   *                named values no longer reach it.
   */
  kind: "dropped" | "stale_inputs";
  /** Contract names (legacy) or consumed-but-no-longer-offered values
   * (provision) — what the user must fix. */
  missing: string[];
  layer: "user" | "org";
  /** True until the evidence (agent declaration / provision offer) is read. */
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

  // Only LEGACY refs need the agent's declaration; provision refs are judged
  // purely on offer vs consumption map. Stable key so the effect doesn't
  // re-fire on every parent render (refs is rebuilt by a useMemo upstream).
  const legacyAgentIds = useMemo(
    () =>
      [...new Set(refs.filter((r) => !r.provisionKey).map((r) => r.agentId))]
        .sort()
        .join(","),
    [refs],
  );

  useEffect(() => {
    if (!legacyAgentIds) return;
    let cancelled = false;
    const ids = legacyAgentIds.split(",");
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
  }, [legacyAgentIds, dispatch]);

  return useMemo(() => {
    const out: Record<string, BindingVerdict> = {};
    // checkedAt is a deliberate dependency: the payloads it reads live in the
    // store, so the memo must recompute once the fetches settle.
    void checkedAt;
    for (const ref of refs) {
      if (ref.provisionKey) {
        if (ref.offeredValueNames === null) {
          out[ref.mandateId] = {
            passing: true,
            kind: "stale_inputs",
            missing: [],
            layer: ref.layer,
            checking: true,
            unreadable: false,
          };
          continue;
        }
        const check = compareConsumptionAgainstOffer(
          ref.offeredValueNames.map((name) => ({ name })),
          ref.consumptionMap,
        );
        out[ref.mandateId] = {
          passing: check.passing,
          kind: "stale_inputs",
          missing: check.missingVariables.map((r) => r.name),
          layer: ref.layer,
          checking: false,
          unreadable: false,
        };
        continue;
      }

      const payload = selectAgentExecutionPayload(store.getState(), ref.agentId);
      if (!payload.isReady) {
        out[ref.mandateId] = {
          passing: true, // never accuse an agent we simply haven't read yet
          kind: "dropped",
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
        kind: "dropped",
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
