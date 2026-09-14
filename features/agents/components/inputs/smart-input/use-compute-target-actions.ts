"use client";

import { useMemo } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { setConversationSandbox } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectChatIncognitoActive } from "@/features/agents/redux/chat/chat-incognito.slice";
import { selectConversationIsEphemeral } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  useComputeTargets,
  type ComputeTarget,
} from "@/hooks/sandbox/use-compute-targets";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import { clearSandboxBindingCache } from "@/lib/sandbox/active-binding";
import { resolveBoundTargetView } from "@/lib/sandbox/bound-target-view";

const MAX_LENS_TARGETS = 2;

function isAvailable(target: ComputeTarget) {
  return (
    target.is_online &&
    (!target.expires_at || new Date(target.expires_at).getTime() > Date.now())
  );
}

function targetKindRank(target: ComputeTarget) {
  return target.kind === "local-pc" ? 0 : 1;
}

/**
 * The OTHER targets to offer inline, beside the bound one.
 *
 * The bound box is never one of these: it is rendered from the conversation's
 * record (see `resolveBoundTargetView`) so it is named on first paint and stays
 * named while it is asleep — it must not depend on being present and online in
 * this list. `boundRowId` is excluded here so it can never appear twice.
 */
export function pickComputeLensTargets(
  targets: ComputeTarget[],
  boundRowId: string | null,
  maxVisible = MAX_LENS_TARGETS,
) {
  const others = targets
    .filter((target) => isAvailable(target) && target.id !== boundRowId)
    .sort((a, b) => {
      const rank = targetKindRank(a) - targetKindRank(b);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    });

  const visible = others.slice(0, Math.max(0, maxVisible));
  return {
    visible,
    overflowCount: Math.max(0, others.length - visible.length),
    /** Everything bindable right now, the bound box included. */
    totalCount: others.length + (boundRowId ? 1 : 0),
  };
}

export function useSandboxBindingBlocked(conversationId: string): boolean {
  const sourceFeature = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.sourceFeature ??
      null,
  );
  const isEphemeral = useAppSelector(
    selectConversationIsEphemeral(conversationId),
  );
  const chatIncognito = useAppSelector(selectChatIncognitoActive);
  return isEphemeral || (chatIncognito && sourceFeature === "chat-route");
}

export function useComputeTargetActions(conversationId: string) {
  const dispatch = useAppDispatch();
  const { data, loading, refetch } = useComputeTargets();
  const binding = useVerifiedSandboxBinding(conversationId);

  const sourceFeature = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.sourceFeature ??
      null,
  );
  const sandboxBlocked = useSandboxBindingBlocked(conversationId);

  const bySurface = useAppSelector(
    (state) => state.userPreferences.coding.activeAgentSandboxBySurface,
  );

  // THE bound box, straight off the conversation's record — named on first
  // paint, and still named while it is asleep or gone. Liveness only decorates
  // it (`state`); it never removes it. See `lib/sandbox/bound-target-view.ts`.
  const boundView = resolveBoundTargetView({
    ref: binding.ref,
    status: binding.status,
    targets: data?.targets ?? null,
  });
  /** The LIVE row for the bound box — present only when it is actually online. */
  const boundTarget = boundView?.state === "online" ? boundView.target : null;
  const hasBinding = !!binding.ref;
  const availableTargets = useMemo(
    () =>
      (data?.targets ?? []).filter(
        (target) => isAvailable(target) && target.id !== binding.ref?.rowId,
      ),
    [data?.targets, binding.ref?.rowId],
  );

  const boundSlots = boundView ? 1 : 0;
  const { visible, overflowCount, totalCount } = useMemo(
    () =>
      pickComputeLensTargets(
        data?.targets ?? [],
        binding.ref?.rowId ?? null,
        MAX_LENS_TARGETS - boundSlots,
      ),
    [data?.targets, binding.ref?.rowId, boundSlots],
  );

  const applyBinding = (target: ComputeTarget | null) => {
    const ref = target
      ? {
          rowId: target.id,
          proxyUrl: "",
          kind: target.kind,
          name: target.name,
          ...(target.tier ? { tier: target.tier } : {}),
        }
      : null;

    if (ref) clearSandboxBindingCache(ref.rowId);
    if (!sourceFeature) {
      toast.error("This conversation is not ready to bind a computer yet.");
      return;
    }

    const next = { ...bySurface };
    if (ref) next[sourceFeature] = ref;
    else delete next[sourceFeature];

    dispatch(
      setPreference({
        module: "coding",
        preference: "activeAgentSandboxBySurface",
        value: next,
      }),
    );
    void dispatch(setConversationSandbox({ conversationId, ref }));
    toast.success(
      ref ? `${target?.name} connected` : "Computer connection removed",
    );
  };

  const disabled =
    !loading &&
    availableTargets.length === 0 &&
    !binding.ref &&
    totalCount === 0;

  return {
    loading: loading || binding.isChecking,
    sandboxBlocked,
    boundTarget,
    /** The bound box as the UI renders it — present whenever a box is bound. */
    boundView,
    hasBinding,
    bindingStatus: binding.status,
    availableTargets,
    visibleTargets: visible,
    overflowCount,
    totalCount,
    applyBinding,
    disabled,
    refresh: refetch,
  };
}

export function computeTargetIconColor(
  target: ComputeTarget,
  isBound: boolean,
): string {
  if (!isBound) return "text-muted-foreground";
  return target.kind === "local-pc" ? "text-blue-500" : "text-emerald-500";
}

export function computeTargetKindLabel(kind: ComputeTarget["kind"]): string {
  return kind === "local-pc" ? "Local PC" : "Sandbox";
}
