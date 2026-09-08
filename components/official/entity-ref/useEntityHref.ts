"use client";

/**
 * components/official/entity-ref/useEntityHref.ts
 *
 * WHERE AN ENTITY-REF LINK ACTUALLY POINTS.
 *
 * For almost every token, the entity registry's `hrefFor(id)` is the whole
 * answer: one id, one canonical route. AGENTS are the exception, and they are
 * the reason this seam exists.
 *
 * An agent's address depends on facts the caller does not hold (see
 * `features/agents/addressing/agentAddress.ts`): a builtin agent opens ONLY
 * under the admin System Agents tree, and the id might not be an agent id at
 * all — the platform stores VERSION ids in agent-shaped columns. Until
 * 2026-09-08 the registry answered `/agents/${id}` for every one of the ~65
 * `EntityRef token="agent"` call sites, so every system agent named anywhere
 * in the app was a link into the wrong shell.
 *
 * Fixing it HERE fixes all of them at once, which is the only fix worth
 * making: a per-call-site fix would be re-broken by the next call site.
 *
 * The hook is called unconditionally with a null id for non-agent tokens, so
 * there is no conditional-hook hazard and no cost for the other tokens.
 */

import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { useAgentHref } from "@/features/agents/addressing/useAgentHref";

export interface EntityHrefResult {
  /** The href, or null while resolving / when the record cannot be placed. */
  href: string | null;
  /**
   * Set only when the record genuinely cannot be reached. The UI must SAY
   * this, not render a link that 404s and not render a dead-looking control
   * with no explanation.
   */
  refusal: string | null;
  /** True while an address is still being resolved — not a refusal. */
  resolving: boolean;
}

export function useEntityHref(
  token: string,
  id: string,
  hrefOverride?: string,
): EntityHrefResult {
  const canonicalToken = resolveEntityToken(token);
  const isAgent = canonicalToken === "agent";

  // Unconditional: a null id makes this free for every other token.
  const agentDoor = useAgentHref({
    id: isAgent && !hrefOverride ? id : null,
    context: `EntityRef token="${token}"`,
  });

  if (hrefOverride) return { href: hrefOverride, refusal: null, resolving: false };

  if (isAgent) {
    if (agentDoor.state === "ready")
      return { href: agentDoor.href, refusal: null, resolving: false };
    if (agentDoor.state === "resolving")
      // A REAL href, not null: `/agents/go/<id>` resolves server-side, so the
      // link works on the very first paint and while the resolver is in
      // flight — and keeps working if the resolver never answers.
      return { href: agentDoor.href, refusal: null, resolving: true };
    return { href: null, refusal: agentDoor.reason, resolving: false };
  }

  const info = tryGetEntityInfo(canonicalToken);
  return {
    href: info?.hrefFor?.(id) ?? null,
    refusal: null,
    resolving: false,
  };
}
