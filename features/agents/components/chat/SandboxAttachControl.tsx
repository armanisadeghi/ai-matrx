"use client";

/**
 * SandboxAttachControl — attach a sandbox to the agent from the chat header.
 *
 * Product model: a user has ONE shared "active agent sandbox" that every
 * conversation binds to by default — so talking to 20 agents feels like one
 * agent sharing the same files, working state, and memory. Picking or claiming
 * a box here sets that shared default (persisted in user preferences, follows
 * the user across reloads/tabs/surfaces).
 *
 * Power-user escape hatch: "Use only for this conversation" writes a
 * per-conversation override (`cx_conversation.sandbox_instance_id`) that wins
 * over the shared default for this thread only.
 *
 * The actual binding (token mint + routing into the box) is resolved at
 * turn-assembly time by `lib/sandbox/active-binding.ts`; this control only
 * records WHICH box is bound.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Plus, Loader2, X, Check, GitBranch } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectConversationIsEphemeral } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { setConversationSandboxOverride } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { CloneRepoDialog } from "@/features/code/views/sandboxes/CloneRepoDialog";
import {
  getEffectiveStatus,
  statusPillClasses,
  STATUS_LABELS,
  ACTIVE_EFFECTIVE_STATUSES,
} from "@/lib/sandbox/status";
import type { SandboxInstance } from "@/types/sandbox";

interface SandboxAttachControlProps {
  conversationId: string | null;
}

type SandboxRef = {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
};

function shortLabel(instance: SandboxInstance): string {
  const sbx = instance.proxy_url?.match(/\/sandboxes\/([^/]+)/)?.[1];
  const template = instance.config?.template;
  if (sbx) return template ? `${sbx} · ${template}` : sbx;
  return instance.id.slice(0, 8);
}

export default function SandboxAttachControl({
  conversationId,
}: SandboxAttachControlProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // When true, picking a box pins it to THIS conversation instead of setting
  // the shared default. Only meaningful inside a (non-ephemeral) conversation.
  const [overrideMode, setOverrideMode] = useState(false);

  const userActive = useAppSelector(
    (s) => s.userPreferences.coding.activeAgentSandbox,
  );
  const override = useAppSelector(
    selectConversationSandboxOverride(conversationId ?? ""),
  );
  const isEphemeral = useAppSelector(
    selectConversationIsEphemeral(conversationId ?? ""),
  );

  // Resolution mirrors active-binding.ts: override wins over shared default.
  const resolved = override ?? userActive ?? null;
  const resolvedSource: "override" | "shared" | null = override
    ? "override"
    : userActive
      ? "shared"
      : null;

  const {
    instances,
    loading,
    fetchInstances,
    createInstance,
  } = useSandboxInstances();

  // Fetch the user's boxes when the popover opens.
  useEffect(() => {
    if (open) void fetchInstances({ limit: 50 });
  }, [open, fetchInstances]);

  const runningInstances = useMemo(
    () =>
      instances.filter((i) =>
        ACTIVE_EFFECTIVE_STATUSES.includes(getEffectiveStatus(i)),
      ),
    [instances],
  );

  const canOverride = !!conversationId && !isEphemeral;
  const effectiveOverrideMode = overrideMode && canOverride;

  const applyRef = useCallback(
    (ref: SandboxRef | null) => {
      if (effectiveOverrideMode && conversationId) {
        void dispatch(
          setConversationSandboxOverride({ conversationId, ref }),
        );
        toast.success(
          ref
            ? "Sandbox attached to this conversation"
            : "Conversation override cleared",
        );
      } else {
        dispatch(
          setPreference({
            module: "coding",
            preference: "activeAgentSandbox",
            value: ref,
          }),
        );
        toast.success(
          ref ? "Active sandbox set for all conversations" : "Sandbox detached",
        );
      }
      setOpen(false);
    },
    [dispatch, effectiveOverrideMode, conversationId],
  );

  const handleClaimNew = useCallback(async () => {
    setCreating(true);
    try {
      const { instance, error } = await createInstance({});
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
  }, [createInstance, applyRef]);

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={
            resolved
              ? `Agent sandbox attached${resolvedSource === "override" ? " (this conversation)" : " (shared)"}`
              : "Attach an agent sandbox"
          }
          className={`relative h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
            resolved
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Box className="h-4 w-4" />
          {resolved && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">Agent sandbox</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The box your agents read, write, and run commands in. Shared across
            all your conversations by default.
          </p>
        </div>

        {/* Current binding */}
        {resolved && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {resolved.proxyUrl.match(/\/sandboxes\/([^/]+)/)?.[1] ??
                  resolved.rowId.slice(0, 8)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {resolvedSource === "override"
                  ? "Pinned to this conversation"
                  : "Shared — all conversations"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setOpen(false);
                  setCloneOpen(true);
                }}
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
              <input
                type="checkbox"
                checked={overrideMode}
                onChange={(e) => setOverrideMode(e.target.checked)}
                className="h-3 w-3 accent-emerald-500"
              />
              Use only for this conversation (advanced)
            </label>
          )}
        </div>
      </PopoverContent>
    </Popover>

    <CloneRepoDialog
      instanceId={resolved?.rowId ?? null}
      open={cloneOpen}
      onOpenChange={setCloneOpen}
    />
    </>
  );
}
