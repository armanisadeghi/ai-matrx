"use client";

/**
 * SandboxPanel — the sandbox-binding body, extracted from the old
 * SandboxAttachControl so it can be embedded in the Smart Input's consolidated
 * controls menu (Sandbox tab) instead of being its own popover button.
 *
 * Product model: a user has ONE shared "active agent sandbox" that every
 * conversation binds to by default. Picking/claiming a box here sets that
 * shared default (persisted in user preferences). "Use only for this
 * conversation" writes a per-conversation override that wins for this thread.
 *
 * The actual binding (token mint + routing) is resolved at turn-assembly time
 * by `lib/sandbox/active-binding.ts`; this panel only records WHICH box is bound.
 */

import { useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  X,
  Check,
  GitBranch,
  Monitor,
  Server,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  selectConversationSandboxOverride,
  selectConversationIsEphemeral,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { setConversationSandboxOverride } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectChatIncognitoActive } from "@/features/agents/components/chat/chat-incognito.slice";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useComputeTargets } from "@/hooks/sandbox/use-compute-targets";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
import { selectSandboxPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { CloneRepoDialog } from "@/features/code/views/sandboxes/CloneRepoDialog";
import {
  getEffectiveStatus,
  statusPillClasses,
  STATUS_LABELS,
  ACTIVE_EFFECTIVE_STATUSES,
} from "@/lib/sandbox/status";
import type { SandboxInstance } from "@/types/sandbox";

interface SandboxPanelProps {
  conversationId: string | null;
}

type SandboxRef = {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  /**
   * Discriminator added when binding to a user's local PC (matrx-local,
   * Cloudflare-tunneled) — undefined / "ec2" / "hosted" for orchestrator
   * sandboxes. Drives `lib/sandbox/active-binding.ts` to skip the
   * orchestrator token-mint and instead resolve through
   * `/api/compute-targets/resolve` (which builds the aidream-proxy URL
   * and uses the Supabase session JWT).
   */
  kind?: "ec2" | "hosted" | "local-pc";
  /** Display label latched at selection time. */
  name?: string;
};

function shortLabel(instance: SandboxInstance): string {
  const sbx = instance.proxy_url?.match(/\/sandboxes\/([^/]+)/)?.[1];
  const template = instance.config?.template;
  if (sbx) return template ? `${sbx} · ${template}` : sbx;
  return instance.id.slice(0, 8);
}

export function SandboxPanel({ conversationId }: SandboxPanelProps) {
  const dispatch = useAppDispatch();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // When true, picking a box pins it to THIS conversation instead of setting
  // the shared default. Only meaningful inside a (non-ephemeral) conversation.
  const [overrideMode, setOverrideMode] = useState(false);

  // The surface this conversation belongs to — Level 2 is keyed by it, so a box
  // bound here only affects conversations on THIS surface (never transcription,
  // etc.). See active-binding.ts#resolveAgentSandboxRef.
  const sourceFeature = useAppSelector((s) =>
    conversationId
      ? (s.conversations.byConversationId[conversationId]?.sourceFeature ??
        null)
      : null,
  );
  const bySurface = useAppSelector(
    (s) => s.userPreferences.coding.activeAgentSandboxBySurface,
  );
  const surfaceBound = sourceFeature
    ? (bySurface[sourceFeature] ?? null)
    : null;
  const override = useAppSelector(
    selectConversationSandboxOverride(conversationId ?? ""),
  );
  const isEphemeral = useAppSelector(
    selectConversationIsEphemeral(conversationId ?? ""),
  );
  const chatIncognito = useAppSelector(selectChatIncognitoActive);
  const sandboxBlocked =
    isEphemeral || (chatIncognito && sourceFeature === "chat-route");

  // Resolution mirrors active-binding.ts: conversation override wins over the
  // per-surface binding.
  const resolved = override ?? surfaceBound ?? null;
  const resolvedSource: "override" | "surface" | null = override
    ? "override"
    : surfaceBound
      ? "surface"
      : null;

  // Liveness layer: a rehydrated binding is only shown as "attached" once it's
  // confirmed reachable. While verifying we show nothing definitive; if the box
  // is gone we surface a re-attach hint instead of a fake "bound" chip.
  const verified = useVerifiedSandboxBinding(conversationId);
  const bindingConfirmed = verified.status === "verified";
  const bindingVerifying = verified.status === "verifying";
  const bindingUnavailable = verified.status === "unavailable";

  const { instances, loading, fetchInstances, createInstance } =
    useSandboxInstances();

  // Unified compute-target list — also pulls the user's matrx-local PCs from
  // `app_instances`. The local-PC subset is rendered above the sandbox list;
  // sandbox rendering still uses `useSandboxInstances` so all existing
  // status / pill / clone behaviour keeps working unchanged.
  const { data: computeTargets, refetch: refetchTargets } = useComputeTargets();
  const localPcs = (computeTargets?.targets ?? []).filter(
    (t) => t.kind === "local-pc",
  );

  // Fetch the user's boxes when the panel mounts (i.e. the Sandbox tab opens).
  useEffect(() => {
    void fetchInstances({ limit: 50 });
  }, [fetchInstances]);

  const handlePickLocalPc = (pc: ComputeTarget) => {
    applyRef({
      rowId: pc.id,
      proxyUrl: "", // server-resolved at chat-send time via resolveComputeTarget
      kind: "local-pc",
      name: pc.name,
    });
  };

  // No useMemo/useCallback in this file — React Compiler memoizes
  // (CLAUDE.md core invariant).
  const runningInstances = instances.filter((i) =>
    ACTIVE_EFFECTIVE_STATUSES.includes(getEffectiveStatus(i)),
  );

  const canOverride = !!conversationId && !sandboxBlocked;
  const effectiveOverrideMode = overrideMode && canOverride;

  if (sandboxBlocked) {
    return (
      <div className="px-3 py-4">
        <p className="text-sm font-medium text-foreground">Agent sandbox</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Unavailable in incognito mode. Your org sandbox, local PC, and surface
          defaults are not attached — the agent runs without a bound filesystem.
        </p>
      </div>
    );
  }

  const applyRef = (ref: SandboxRef | null) => {
    if (effectiveOverrideMode && conversationId) {
      void dispatch(setConversationSandboxOverride({ conversationId, ref }));
      toast.success(
        ref
          ? "Sandbox attached to this conversation"
          : "Conversation override cleared",
      );
    } else {
      if (!sourceFeature) {
        toast.error(
          "This conversation has no surface yet — try again in a moment.",
        );
        return;
      }
      // Read-modify-write the per-surface map so we only touch THIS surface.
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
      toast.success(
        ref
          ? "Sandbox bound for this surface (every chat here)"
          : "Sandbox detached from this surface",
      );
    }
  };

  // Sandbox defaults the user configured in Settings → Sandbox. The "New
  // sandbox" button passes these to the orchestrator so every box the user
  // creates from chat matches their configured template / tier / env / etc.
  const sandboxPrefs = useAppSelector(selectSandboxPreferences);

  const handleClaimNew = async () => {
    setCreating(true);
    try {
      const { instance, error } = await createInstance({
        template: sandboxPrefs.template,
        tier: sandboxPrefs.tier,
        ttl_seconds: sandboxPrefs.ttl_seconds ?? undefined,
        labels: {
          ...(sandboxPrefs.default_git_repo
            ? { default_git_repo: sandboxPrefs.default_git_repo }
            : {}),
          ...(sandboxPrefs.default_git_branch
            ? { default_git_branch: sandboxPrefs.default_git_branch }
            : {}),
          ...(sandboxPrefs.auto_clone_on_create ? { auto_clone: "true" } : {}),
        },
        config: {
          // Forward env vars so the orchestrator can materialise them on
          // container start. Coexists with the orchestrator's own defaults.
          env: sandboxPrefs.env,
        },
      });
      if (error || !instance) {
        toast.error(error ?? "Failed to create sandbox");
        return;
      }
      if (!instance.proxy_url) {
        toast.error("Sandbox created but has no proxy URL yet — try again");
        return;
      }
      applyRef({
        rowId: instance.id,
        proxyUrl: instance.proxy_url,
        tier: instance.tier ?? undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex flex-col">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">Agent sandbox</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The box your agents read, write, and run commands in. Binds to every
            conversation on THIS surface — not other surfaces.
          </p>
        </div>

        {/* Current binding — only shown once liveness is confirmed. While we're
            still checking we show a quiet "verifying" line; if the saved box is
            gone we show a re-attach hint instead of pretending it's bound. */}
        {resolved && bindingVerifying && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            Checking bound sandbox…
          </div>
        )}

        {resolved && bindingUnavailable && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-amber-500/10">
            <div className="min-w-0 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                Your previously bound sandbox is no longer available. Attach a
                running one below.
              </p>
            </div>
            <button
              onClick={() => applyRef(null)}
              className="flex items-center gap-1 shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Clear the stale binding"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {resolved && bindingConfirmed && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {resolved.proxyUrl.match(/\/sandboxes\/([^/]+)/)?.[1] ??
                  resolved.rowId.slice(0, 8)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {resolvedSource === "override"
                  ? "Pinned to this conversation"
                  : "Bound for this surface (every chat here)"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setCloneOpen(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Clone a git repo into this box"
              >
                <GitBranch className="h-3 w-3" />
                Clone repo
              </button>
              <button
                onClick={() => applyRef(null)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                title="Detach"
              >
                <X className="h-3 w-3" />
                Detach
              </button>
            </div>
          </div>
        )}

        {/* Your computers (matrx-local PCs registered with a Cloudflare tunnel) */}
        {localPcs.length > 0 && (
          <div className="border-b border-border">
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your computers
            </div>
            <div className="max-h-32 overflow-y-auto pb-1">
              {localPcs.map((pc) => {
                const isBound =
                  resolved?.rowId === pc.id ||
                  (resolved?.kind === "local-pc" &&
                    (resolved as SandboxRef).rowId === pc.id);
                return (
                  <button
                    key={pc.id}
                    onClick={() => handlePickLocalPc(pc)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-accent/60 transition-colors"
                    title={
                      pc.is_online
                        ? "Online"
                        : "Offline — start matrx-local on this device"
                    }
                  >
                    <span className="min-w-0 flex items-center gap-2">
                      {isBound && (
                        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                      )}
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          pc.is_online
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      <Monitor className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-foreground truncate">
                        {pc.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {pc.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sandboxes section header (only when local PCs are also present) */}
        {localPcs.length > 0 && (
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sandboxes
          </div>
        )}

        {/* Running boxes to pick from */}
        <div className="max-h-56 overflow-y-auto py-1">
          {loading && runningInstances.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading sandboxes…
            </div>
          ) : runningInstances.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No running sandboxes. Create one below.
            </p>
          ) : (
            runningInstances.map((inst) => {
              const isBound = resolved?.rowId === inst.id;
              const status = getEffectiveStatus(inst);
              return (
                <button
                  key={inst.id}
                  onClick={() =>
                    inst.proxy_url &&
                    applyRef({
                      rowId: inst.id,
                      proxyUrl: inst.proxy_url,
                      tier: inst.tier ?? undefined,
                    })
                  }
                  disabled={!inst.proxy_url}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-accent/60 transition-colors disabled:opacity-50"
                >
                  <span className="min-w-0 flex items-center gap-2">
                    {isBound && (
                      <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    )}
                    <span className="text-xs text-foreground truncate">
                      {shortLabel(inst)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusPillClasses(status)}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border p-2 space-y-1.5">
          <button
            onClick={handleClaimNew}
            disabled={creating}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground hover:bg-accent/60 transition-colors disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {creating ? "Creating sandbox…" : "New sandbox"}
          </button>

          {canOverride && (
            <label className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={overrideMode}
                onCheckedChange={(v) => setOverrideMode(v === true)}
              />
              Use only for this conversation (advanced)
            </label>
          )}
        </div>
      </div>

      <CloneRepoDialog
        instanceId={resolved?.rowId ?? null}
        open={cloneOpen}
        onOpenChange={setCloneOpen}
      />
    </>
  );
}
