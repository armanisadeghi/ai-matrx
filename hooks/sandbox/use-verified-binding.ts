"use client";

/**
 * useVerifiedSandboxBinding — the single primitive that answers "is the box
 * this conversation is bound to ACTUALLY accessible right now?".
 *
 * Why this exists:
 *   A surface-default / per-conversation sandbox binding is persisted in user
 *   preferences and rehydrates on page load. But a box expires, stops, or (for
 *   a local PC) goes offline long after it was bound — the stored ref carries
 *   no liveness signal. Rendering it as "attached" straight from preferences
 *   lies to the user and leads to a turn routed at a dead host.
 *
 *   This hook gates display (and lets callers gate attach) on a live check
 *   against `/api/compute-targets`, which reports each box's real status. Until
 *   the check confirms the box is online we report `verifying` and the UI shows
 *   NOTHING — the binding only surfaces once it's proven reachable. A box that
 *   is gone reports `unavailable`, so the user can simply attach a fresh one.
 *
 * Resolution mirrors `lib/sandbox/active-binding.ts#resolveAgentSandboxRef`
 * (conversation override wins over the per-surface default) and honours the
 * same incognito / ephemeral gates, so the UI and the turn-time binding never
 * disagree about WHICH box is bound — only this hook adds the liveness layer.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectConversationSandboxOverride,
  selectConversationIsEphemeral,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectChatIncognitoActive } from "@/features/agents/components/chat/chat-incognito.slice";
import {
  useComputeTargets,
  type ComputeTarget,
} from "@/hooks/sandbox/use-compute-targets";

export type SandboxVerificationStatus =
  | "none" // nothing bound for this conversation/surface
  | "verifying" // a box is bound; still confirming it's reachable
  | "verified" // bound box confirmed online/accessible
  | "unavailable"; // bound box is gone / offline — user should re-attach

export interface VerifiedSandboxRef {
  rowId: string;
  proxyUrl?: string;
  tier?: "ec2" | "hosted";
  kind?: "ec2" | "hosted" | "local-pc";
  name?: string;
}

export interface VerifiedSandboxBinding {
  /** The persisted ref, regardless of liveness (null when nothing bound). */
  ref: VerifiedSandboxRef | null;
  /** Where the ref came from. */
  source: "override" | "surface" | null;
  /** Live-checked status. Treat ONLY `verified` as "attached" in the UI. */
  status: SandboxVerificationStatus;
  /** The matched live compute target when `verified`. */
  target: ComputeTarget | null;
  /** True while the liveness check is still in flight (no answer yet). */
  isChecking: boolean;
  /** Re-run the liveness check (e.g. after the user starts a box). */
  refresh: () => Promise<void>;
}

/** A bound sandbox is reachable if its target is online and not time-expired. */
function isTargetAccessible(target: ComputeTarget): boolean {
  if (!target.is_online) return false;
  // Mirror getEffectiveStatus: the orchestrator's idle sweep can lag, so a box
  // whose expires_at is already in the past is treated as gone even if the row
  // still reads ready/running.
  if (
    target.expires_at &&
    new Date(target.expires_at).getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
}

export function useVerifiedSandboxBinding(
  conversationId: string | null,
): VerifiedSandboxBinding {
  const override = useAppSelector(
    selectConversationSandboxOverride(conversationId ?? ""),
  );
  const isEphemeral = useAppSelector(
    selectConversationIsEphemeral(conversationId ?? ""),
  );
  const chatIncognito = useAppSelector(selectChatIncognitoActive);
  const sourceFeature = useAppSelector((s) =>
    conversationId
      ? (s.conversations.byConversationId[conversationId]?.sourceFeature ??
        null)
      : null,
  );
  const surfaceBound = useAppSelector((s) =>
    sourceFeature
      ? (s.userPreferences.coding.activeAgentSandboxBySurface[sourceFeature] ??
        null)
      : null,
  );

  const { data, loading, refetch } = useComputeTargets();

  // Same gating as the turn-time resolver: no binding in incognito chat or for
  // ephemeral conversations.
  const blocked =
    isEphemeral || (chatIncognito && sourceFeature === "chat-route");

  const ref: VerifiedSandboxRef | null = blocked
    ? null
    : (override ?? surfaceBound ?? null);
  const source: "override" | "surface" | null = blocked
    ? null
    : override
      ? "override"
      : surfaceBound
        ? "surface"
        : null;

  let status: SandboxVerificationStatus = "none";
  let target: ComputeTarget | null = null;

  if (ref) {
    if (!data) {
      // No answer yet — never assert "attached" before we've confirmed it.
      status = "verifying";
    } else {
      const match = data.targets.find((t) => t.id === ref.rowId) ?? null;
      if (match && isTargetAccessible(match)) {
        status = "verified";
        target = match;
      } else {
        status = "unavailable";
      }
    }
  }

  return {
    ref,
    source,
    status,
    target,
    isChecking: !!ref && !data && loading,
    refresh: refetch,
  };
}
