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

import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  type AgentAddressViewer,
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

const noSubscribe = () => () => {};

/**
 * WHO IS LOOKING, for the address rule (`AgentAddressViewer`). Reads the store
 * when there is one; a render with no store (an isolated test, a portal
 * outside the app) gets `undefined`, which keeps the admin-surface default.
 * Every real page renders inside the store, so every member gets their own
 * answer.
 */
export function useAgentAddressViewer(): AgentAddressViewer | undefined {
  const store = useContext(ReactReduxContext)?.store;
  const read = () =>
    store ? selectIsAdmin(store.getState() as RootState) : undefined;
  const isAdmin = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    read,
    read,
  );
  return isAdmin === undefined ? undefined : { isAdmin };
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
  // A builtin opens in the admin tree only for an admin; everyone else gets
  // the ordinary agent page (see `AgentAddressViewer`).
  const viewer = useAgentAddressViewer();

  // A caller that holds the row needs no read and no state churn.
  const immediate: AgentDoor | null = !id
    ? { state: "unknown", reason: "No agent id was supplied." }
    : knownType
      ? agentDoorFor({ agentId: id, agentType: agentType ?? null }, sub, viewer)
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
  return agentDoorFor(resolved, sub, viewer);
}
