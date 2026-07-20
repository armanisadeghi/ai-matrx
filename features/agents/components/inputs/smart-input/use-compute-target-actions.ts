"use client";

import { useMemo } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { setConversationSandbox } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectChatIncognitoActive } from "@/features/agents/components/chat/chat-incognito.slice";
import { selectConversationIsEphemeral } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  useComputeTargets,
  type ComputeTarget,
} from "@/hooks/sandbox/use-compute-targets";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import { clearSandboxBindingCache } from "@/lib/sandbox/active-binding";

const MAX_LENS_TARGETS = 2;

function isAvailable(target: ComputeTarget) {
  return (
    target.is_online &&
    (!target.expires_at || new Date(target.expires_at).getTime() > Date.now())
  );
}

function targetKindRank(target: ComputeTarget, boundId: string | null) {
  if (boundId === target.id) return 0;
  if (target.kind === "local-pc") return 1;
  return 2;
}

/** Pick up to two inline targets — prefer bound, then local PC + sandbox. */
export function pickComputeLensTargets(
  targets: ComputeTarget[],
  boundTarget: ComputeTarget | null,
  maxVisible = MAX_LENS_TARGETS,
) {
  const byId = new Map<string, ComputeTarget>();
  if (boundTarget) byId.set(boundTarget.id, boundTarget);
  for (const target of targets.filter(isAvailable)) {
    byId.set(target.id, target);
  }

  const all = [...byId.values()].sort((a, b) => {
    const rank =
      targetKindRank(a, boundTarget?.id ?? null) -
      targetKindRank(b, boundTarget?.id ?? null);
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name);
  });

  const visible: ComputeTarget[] = [];
  const push = (target: ComputeTarget | undefined) => {
    if (!target || visible.some((v) => v.id === target.id)) return;
    if (visible.length < maxVisible) visible.push(target);
  };

  push(boundTarget ?? undefined);
  push(all.find((t) => t.kind === "local-pc"));
  push(all.find((t) => t.kind !== "local-pc"));
  for (const target of all) push(target);

  return {
    visible: visible.slice(0, maxVisible),
    overflowCount: Math.max(0, all.length - visible.length),
    totalCount: all.length,
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

  const boundTarget = binding.status === "verified" ? binding.target : null;
  const hasBinding = !!binding.ref;
  const availableTargets = useMemo(
    () =>
      (data?.targets ?? []).filter(
        (target) => isAvailable(target) && target.id !== boundTarget?.id,
      ),
    [data?.targets, boundTarget?.id],
  );

  const { visible, overflowCount, totalCount } = useMemo(
    () =>
      pickComputeLensTargets(
        data?.targets ?? [],
        boundTarget,
        MAX_LENS_TARGETS,
      ),
    [data?.targets, boundTarget],
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
