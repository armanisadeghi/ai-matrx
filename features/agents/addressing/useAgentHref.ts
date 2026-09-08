"use client";

/**
 * features/agents/addressing/useAgentHref.ts
 *
 * The React door onto the one address rule (`agentAddress.ts`).
 *
 * A caller passes whatever it holds. If it holds the row's `agent_type`, the
 * answer is synchronous and free. If it holds only an id — the common case for
 * `EntityRef`, mandate rows, binding rows, lineage lines — the hook resolves
 * the kind through the batched cache and reports `resolving` until it knows.
 *
 * It NEVER returns a guessed href, and it never returns a DEAD one: while the
 * kind is unknown the href is `/agents/go/<id>`, which resolves server-side,
 * so the link works from the first paint and keeps working if the resolver
 * never answers. Only a resolved MISS produces a refusal, with a sentence.
 */

import { useEffect, useState } from "react";
import {
  agentDoorFor,
  agentGoHref,
  reportVersionIdRescued,
  unresolvedAgentReason,
  type AgentDoor,
} from "./agentAddress";
import {
  peekAgentAddress,
  resolveAgentAddress,
  type AgentAddressResult,
} from "./agentAddressCache";

export interface UseAgentHrefInput {
  /** An agent id OR a version id — the hook figures out which. */
  id: string | null | undefined;
  /**
   * `agent_type` when the caller already holds the row. Supplying it skips the
   * read entirely; omitting it costs one batched, cached RPC.
   */
  agentType?: string | null;
  /** Route suffix ("/run", "/build"); omit for the record's own page. */
  sub?: string;
  /**
   * Where this link lives — used only in the version-guard's message so a
   * thrown mis-address names the surface that built it.
   */
  context?: string;
}

/**
 * Where this agent opens. See `AgentDoor` — `ready` | `resolving` | `unknown`.
 */
export function useAgentHref({
  id,
  agentType,
  sub = "",
  context = "an agent link",
}: UseAgentHrefInput): AgentDoor {
  const knownType = agentType !== undefined && agentType !== null;

  // A caller that holds the row needs no read and no state churn.
  const immediate: AgentDoor | null = !id
    ? { state: "unknown", reason: "No agent id was supplied." }
    : knownType
      ? agentDoorFor({ agentId: id, agentType: agentType ?? null }, sub)
      : null;

  const [resolved, setResolved] = useState<AgentAddressResult | undefined>(() =>
    id && !knownType ? peekAgentAddress(id) : undefined,
  );

  useEffect(() => {
    if (!id || knownType) return;
    const cached = peekAgentAddress(id);
    if (cached !== undefined) {
      setResolved(cached);
      return;
    }
    let live = true;
    const answer = resolveAgentAddress(id);
    if (answer instanceof Promise) {
      void answer.then((value) => {
        if (live) setResolved(value);
      });
    } else {
      setResolved(answer);
    }
    return () => {
      live = false;
    };
  }, [id, knownType]);

  if (immediate) return immediate;
  if (!id) return { state: "unknown", reason: "No agent id was supplied." };
  if (resolved === undefined)
    return { state: "resolving", href: agentGoHref(id, sub) };
  if (resolved === null)
    return { state: "unknown", reason: unresolvedAgentReason(id) };

  reportVersionIdRescued(resolved, id, context);
  return agentDoorFor(resolved, sub);
}
