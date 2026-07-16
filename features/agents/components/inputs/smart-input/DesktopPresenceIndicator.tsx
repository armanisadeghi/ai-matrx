"use client";

/**
 * DesktopPresenceIndicator — the compact compute-target picker in the smart
 * input. It distinguishes a target that is merely available from one actually
 * bound to this conversation/surface, and between a local PC and a sandbox.
 */

import { Box, Laptop, Loader2, Monitor, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { setConversationSandbox } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import {
  useComputeTargets,
  type ComputeTarget,
} from "@/hooks/sandbox/use-compute-targets";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import { clearSandboxBindingCache } from "@/lib/sandbox/active-binding";

interface DesktopPresenceIndicatorProps {
  conversationId: string;
}

function isAvailable(target: ComputeTarget) {
  return (
    target.is_online &&
    (!target.expires_at || new Date(target.expires_at).getTime() > Date.now())
  );
}

function TargetIcon({
  kind,
  className,
}: {
  kind: ComputeTarget["kind"];
  className?: string;
}) {
  return kind === "local-pc" ? (
    <Monitor className={className} />
  ) : (
    <Box className={className} />
  );
}

export function DesktopPresenceIndicator({
  conversationId,
}: DesktopPresenceIndicatorProps) {
  const dispatch = useAppDispatch();
  const { data, loading } = useComputeTargets();
  const binding = useVerifiedSandboxBinding(conversationId);
  const sourceFeature = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.sourceFeature ??
      null,
  );
  const bySurface = useAppSelector(
    (state) => state.userPreferences.coding.activeAgentSandboxBySurface,
  );

  const availableTargets = (data?.targets ?? []).filter(
    (target) => isAvailable(target) && target.id !== binding.target?.id,
  );
  const boundTarget = binding.status === "verified" ? binding.target : null;
  const hasBoundTarget = !!boundTarget;
  // A stale binding still needs an escape hatch even when no other box is live.
  const disabled = !loading && availableTargets.length === 0 && !binding.ref;

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

  const Icon =
    boundTarget?.kind === "local-pc" ? Monitor : boundTarget ? Box : Laptop;
  const iconColor =
    boundTarget?.kind === "local-pc"
      ? "text-blue-500"
      : boundTarget
        ? "text-emerald-500"
        : "";
  const tooltip = hasBoundTarget
    ? `${boundTarget.kind === "local-pc" ? "Local computer" : "Sandbox"} connected: ${boundTarget.name}`
    : loading
      ? "Checking available computers and sandboxes"
      : availableTargets.length
        ? "Connect a computer or sandbox"
        : "No computers or sandboxes are available";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={tooltip}
          aria-label={tooltip}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            hasBoundTarget
              ? `${iconColor} bg-muted/60 hover:bg-muted`
              : "text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground"
          } disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:hover:bg-transparent`}
        >
          {loading && !hasBoundTarget ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 overflow-hidden p-1.5"
      >
        {hasBoundTarget && (
          <div className="mb-1 border-b px-1.5 pb-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Connected
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                <TargetIcon
                  kind={boundTarget.kind}
                  className={`h-3.5 w-3.5 shrink-0 ${iconColor}`}
                />
                <span className="truncate">{boundTarget.name}</span>
              </span>
              <button
                type="button"
                onClick={() => applyBinding(null)}
                className="text-muted-foreground hover:text-destructive"
                title="Disconnect"
              >
                <Unplug className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Available
        </p>
        <div className="space-y-0.5">
          {availableTargets.map((target) => {
            const color =
              target.kind === "local-pc" ? "text-blue-500" : "text-emerald-500";
            const kindLabel =
              target.kind === "local-pc" ? "Local PC" : "Sandbox";
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => applyBinding(target)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-accent"
              >
                <TargetIcon
                  kind={target.kind}
                  className={`h-3.5 w-3.5 shrink-0 ${color}`}
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {target.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {kindLabel}
                </span>
              </button>
            );
          })}
          {availableTargets.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No available targets.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
