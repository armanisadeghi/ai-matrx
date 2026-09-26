"use client";

/**
 * SandboxPanel — the sandbox-binding body, extracted from the old
 * SandboxAttachControl so it can be embedded in the Smart Input's consolidated
 * controls menu (Sandbox tab) instead of being its own popover button.
 *
 * Product model (owner, 2026-09-14): picking/claiming a box here binds THIS
 * CONVERSATION — the scope the server actually persists
 * (`chat.conversation.sandbox_instance_id`). Making the box the shared default
 * for every new chat on this surface is an explicit OPT-IN checkbox. The
 * decision lives in `lib/sandbox/binding-scope.ts`; this panel only dispatches
 * what that plan says.
 *
 * The actual binding (token mint + routing) is resolved at turn-assembly time
 * by `lib/sandbox/active-binding.ts`; this panel only records WHICH box is bound.
 */

import { useEffect, useState } from "react";
import { Input } from "@ai-matrx/design-system";
import {
  PencilTapButton,
  ExternalLinkTapButton,
  CheckTapButton,
  XTapButton,
} from "@ai-matrx/tap-target/buttons";
import { sandboxDisplayName } from "@/lib/sandbox/format";
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
import { toast } from "@/lib/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  selectConversationSandboxBinding,
  selectConversationIsEphemeral,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { setConversationSandbox } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectChatIncognitoActive } from "@/features/agents/redux/chat/chat-incognito.slice";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useComputeTargets } from "@/hooks/sandbox/use-compute-targets";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import {
  describeBoundTargetState,
  resolveBoundTargetView,
} from "@/lib/sandbox/bound-target-view";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
import { selectSandboxPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { CloneRepoDialog } from "@/features/code/views/sandboxes/CloneRepoDialog";
import {
  getEffectiveStatus,
  statusPillClasses,
  STATUS_LABELS,
  ACTIVE_EFFECTIVE_STATUSES,
} from "@/lib/sandbox/status";
import { clearSandboxBindingCache } from "@/lib/sandbox/active-binding";
import { resolveBindingScope } from "@/lib/sandbox/binding-scope";
import type { SandboxInstance } from "@/types/sandbox";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

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

export function SandboxPanel({ conversationId }: SandboxPanelProps) {
  const dispatch = useAppDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // OPT-IN: when true, picking a box ALSO makes it the default for every new
  // chat on this surface. Default false — a pick binds THIS conversation only.
  const [shareAcrossSurface, setShareAcrossSurface] = useState(false);

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
  const binding = useAppSelector(
    selectConversationSandboxBinding(conversationId ?? ""),
  );
  const isEphemeral = useAppSelector(
    selectConversationIsEphemeral(conversationId ?? ""),
  );
  const chatIncognito = useAppSelector(selectChatIncognitoActive);
  const sandboxBlocked =
    isEphemeral || (chatIncognito && sourceFeature === "chat-route");

  // What this conversation will actually use: its OWN binding (the source of
  // truth, `cx_conversation.sandbox_instance_id`) or — if it has never been
  // bound — the surface seed, which the next turn promotes onto the record.
  // Mirrors active-binding.ts#getEffectiveSandboxRef.
  const resolved = binding ?? surfaceBound ?? null;
  const resolvedSource: "override" | "surface" | null = binding
    ? "override"
    : surfaceBound
      ? "surface"
      : null;

  // Liveness layer: it DECORATES the binding, it never removes it. The strip
  // always names the box this chat is on — while the check is out, and while
  // the box is asleep or gone — because the record always has that answer.
  // (Arman, 2026-09-14: opening a chat that was on a sandbox must put you back
  // on that sandbox in the UI, immediately.)
  const verified = useVerifiedSandboxBinding(conversationId);


  // Sandbox defaults the user configured in Settings → Sandbox. The "New
  // sandbox" button passes these to the orchestrator so every box the user
  // creates from chat matches their configured template / tier / env / etc.
  // Must sit ABOVE the `sandboxBlocked` early return — it used to live below it,
  // which made this a conditional hook (React would misalign the hook order the
  // first time incognito flipped mid-session).
  const sandboxPrefs = useAppSelector(selectSandboxPreferences);
  const organizationId = useAppSelector(selectOrganizationId);

  const {
    instances,
    loading,
    fetchInstances,
    createInstance,
    renameInstance,
    error: sandboxError,
  } = useSandboxInstances();

  // Unified compute-target list — also pulls the user's matrx-local PCs from
  // `app_instances`. The local-PC subset is rendered above the sandbox list;
  // sandbox rendering still uses `useSandboxInstances` so all existing
  // status / pill / clone behaviour keeps working unchanged.
  const { data: computeTargets } = useComputeTargets();
  const boundView = resolveBoundTargetView({
    ref: verified.ref,
    status: verified.status,
    targets: computeTargets?.targets ?? null,
  });
  const boundState = boundView ? describeBoundTargetState(boundView) : null;
  // Quickset and the full Sandbox tab share this picker. Only present targets
  // the user can actually bind — offline local computers are status, not
  // available execution targets.
  const localPcs = (computeTargets?.targets ?? []).filter(
    (target) => target.kind === "local-pc" && target.is_online,
  );

  // Fetch the user's boxes when the panel mounts (i.e. the Sandbox tab opens).
  useEffect(() => {
    void fetchInstances({ limit: 50 });
  }, [fetchInstances]);

  const boundInstance = instances.find(
    (instance) => instance.id === resolved?.rowId,
  );

  const saveName = async () => {
    if (!editingId || savingName) return;
    const name = nameDraft.trim();
    if (!name || name.length > 100) {
      setNameError("Enter a label between 1 and 100 characters.");
      return;
    }
    setSavingName(true);
    const renamed = await renameInstance(editingId, name);
    setSavingName(false);
    if (!renamed) {
      setNameError("Could not save the label. Please try again.");
      return;
    }
    clearSandboxBindingCache(editingId);
    setEditingId(null);
    setNameError(null);
  };

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

  // The surface opt-in is only offerable when there IS a surface to seed and
  // binding is possible at all (`sandboxBlocked` = ephemeral / incognito chat).
  const canShareAcrossSurface = !!sourceFeature && !sandboxBlocked;
  const effectiveShareAcrossSurface =
    shareAcrossSurface && canShareAcrossSurface;

  if (sandboxBlocked) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs text-muted-foreground">
          Sandbox unavailable in incognito mode.
        </p>
      </div>
    );
  }

  const applyRef = (ref: SandboxRef | null) => {
    // (Re-)attaching a box is an explicit "use this now" — clear any suppression
    // / token tombstone so it resolves on the very next send, instead of waiting
    // out the dead-box cooldown. This is the manual-recovery path that
    // complements the automatic TTL self-heal.
    if (ref?.rowId) clearSandboxBindingCache(ref.rowId);

    // THE SCOPE DECISION lives in one pure place, shared with the `+` menu.
    const plan = resolveBindingScope({
      conversationId,
      sourceFeature,
      shareAcrossSurface: effectiveShareAcrossSurface,
    });
    if (plan.blockedReason) {
      toast.error(plan.blockedReason);
      return;
    }

    if (plan.writeSurfaceSeed && sourceFeature) {
      // Read-modify-write the per-surface map so we only touch THIS surface.
      // This is the SEED future conversations on the surface inherit.
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
    }

    // The conversation you're standing in gets bound right now, on the record
    // (and in the DB the server reads: chat.conversation.sandbox_instance_id).
    if (plan.bindConversation && conversationId) {
      void dispatch(setConversationSandbox({ conversationId, ref }));
    }

    toast.success(ref ? plan.attachMessage : plan.detachMessage);
  };

  const handleClaimNew = async () => {
    setCreating(true);
    try {
      if (!organizationId) {
        toast.error(
          "Select an organization before creating a sandbox. The request was not sent.",
        );
        return;
      }
      const { instance, error } = await createInstance({
        organization_id: organizationId,
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
        name: sandboxDisplayName(instance),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex flex-col">
        {/* Bound-state strip — ALWAYS present, one line, no ambiguity. */}
        {!resolved ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">
              No sandbox bound
            </span>
          </div>
        ) : boundView ? (
          <div
            className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2 ${
              boundView.state === "gone" ? "bg-amber-500/10" : "bg-muted/40"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {boundView.state === "checking" ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              ) : boundView.state === "gone" ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    boundView.state === "online"
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/50"
                  }`}
                />
              )}
              <span className="truncate text-xs font-medium text-foreground">
                {boundInstance ? sandboxDisplayName(boundInstance) : boundView.name}
              </span>
              <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                {resolvedSource === "override" ? "this chat" : "this surface"}
              </span>
              {boundState && boundView.state !== "online" ? (
                <span
                  className="shrink-0 text-[10px] text-muted-foreground"
                  title={boundState.remedy ?? undefined}
                >
                  {boundState.label}
                  {boundState.remedy ? ` — ${boundState.remedy}` : ""}
                </span>
              ) : null}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setCloneOpen(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                title="Clone a git repo into this box"
              >
                <GitBranch className="h-3 w-3" />
                Clone
              </button>
              <button
                onClick={() => applyRef(null)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                title="Detach"
              >
                <X className="h-3 w-3" />
                Detach
              </button>
            </div>
          </div>
        ) : null}

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
                <div key={inst.id} className="px-3 py-1">
                  {editingId === inst.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveName();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!savingName) setEditingId(null);
                        }
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <Input
                          autoFocus
                          aria-label={`Label for ${inst.sandbox_id}`}
                          placeholder="Sandbox label"
                          value={nameDraft}
                          maxLength={100}
                          disabled={savingName}
                          onChange={(event) => {
                            setNameDraft(event.target.value);
                            setNameError(null);
                          }}
                          className="h-9 min-w-0 flex-1 text-base sm:h-7 sm:text-xs"
                        />
                        <CheckTapButton
                          variant="transparent"
                          ariaLabel="Save sandbox label"
                          tooltip="Save label"
                          disabled={savingName || !nameDraft.trim()}
                          onClick={() => void saveName()}
                        />
                        <XTapButton
                          variant="transparent"
                          ariaLabel="Cancel sandbox label"
                          tooltip="Cancel"
                          disabled={savingName}
                          onClick={() => setEditingId(null)}
                        />
                      </div>
                      {nameError && (
                        <ErrorNotice size="inline" className="mt-1 text-xs" message={sandboxError || nameError} />
                      )}
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          inst.proxy_url &&
                          applyRef({
                            rowId: inst.id,
                            proxyUrl: inst.proxy_url,
                            tier: inst.tier ?? undefined,
                            name: sandboxDisplayName(inst),
                          })
                        }
                        disabled={!inst.proxy_url}
                        title={[sandboxDisplayName(inst), inst.sandbox_id, inst.template, inst.tier]
                          .filter(Boolean)
                          .join(" · ")}
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded text-left transition-colors hover:bg-accent/60 disabled:opacity-50 sm:min-h-7"
                      >
                        {isBound && (
                          <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {sandboxDisplayName(inst)}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusPillClasses(status)}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </button>
                      <PencilTapButton
                        variant="transparent"
                        ariaLabel={`Rename ${sandboxDisplayName(inst)}`}
                        tooltip={
                          inst.name?.trim() ? "Rename" : "Name this sandbox"
                        }
                        onClick={() => {
                          setEditingId(inst.id);
                          setNameDraft(inst.name ?? "");
                          setNameError(null);
                        }}
                      />
                      <ExternalLinkTapButton
                        variant="transparent"
                        ariaLabel={`Open files in ${sandboxDisplayName(inst)} in a new tab`}
                        tooltip="Open in Code · new tab"
                        href={`/code?sandbox=${encodeURIComponent(inst.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </div>
                  )}
                </div>
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

          {canShareAcrossSurface && (
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
              <Checkbox
                checked={shareAcrossSurface}
                onCheckedChange={(v) => setShareAcrossSurface(v === true)}
              />
              Also use for every new chat here
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
