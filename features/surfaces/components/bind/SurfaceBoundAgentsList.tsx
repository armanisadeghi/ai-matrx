"use client";

/**
 * features/surfaces/components/bind/SurfaceBoundAgentsList.tsx
 *
 * Drop-in "agents on this surface" list. Sections with agents only:
 *   Public · Mine · Org names · Shared with me
 *
 * Compact single-line rows: Play · name · Settings · Detach (when bound here).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Play, Plus, Settings, Unlink } from "lucide-react";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import {
  isCapturedSurfaceRegistrationError,
  isSurfaceRegistrationError,
} from "@ai-matrx/chat/surfaces/services/surface-registration-error";

import { useSurfaceBoundAgents } from "@ai-matrx/chat/surfaces/hooks/useSurfaceBoundAgents";
import { getManifest as getSurfaceIndexEntry } from "@ai-matrx/chat/surfaces/runtime/registry";
import { useSurfaceAgentRoles } from "@ai-matrx/chat/surfaces/hooks/useSurfaceConfig";
import { useAgentNames } from "@ai-matrx/chat/surfaces/hooks/useAgentNames";
import { getSurfaceDisplayLabel } from "@ai-matrx/chat/surfaces/utils/surface-display";
import { useOpenSurfaceAgentBindWindow } from "@/features/overlays/openers/surfaceAgentBindWindow";
import { useOpenAgentSettingsWindow } from "@/features/overlays/openers/agentSettingsWindow";
import { deleteAgentSurfaceBinding } from "@ai-matrx/chat/surfaces/services/bind-agent-to-surface.service";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { SurfaceBoundAgentEntry } from "@ai-matrx/chat/surfaces/services/surface-bound-agents.service";
import { ReadFailure } from "@ai-matrx/design-system";

export interface SurfaceBoundAgentsListProps {
  surfaceName: string;
  /**
   * Called when the user hits Play. Surfaces build their own
   * `applicationScope` + launch options here.
   */
  onRunAgent: (agentId: string) => void | Promise<void>;
  /** Disable Run buttons (e.g. no document content yet). */
  runDisabled?: boolean;
  /** Hide the whole block when empty and not loading. Default false. */
  hideWhenEmpty?: boolean;
  /** Pass through to `useSurfaceBoundAgents`. */
  isEditable?: boolean;
  includeDefaults?: boolean;
  /**
   * Also list the surface's ROLE-bound agents (`ui.ui_surface_agent_role`
   * resolved via `useSurfaceAgentRoles`) as a "Surface roles" section.
   * Role agents are definition-tier — they need no `agent.card` row or
   * `platform.associations` edge to appear. Default true.
   */
  includeRoles?: boolean;
  className?: string;
  /** Override the empty-state copy. */
  emptyMessage?: string;
  /** Override the add-button label. */
  addLabel?: string;
}

/** The settled height of each surface's list, remembered for the session so a re-open reserves it exactly. */
const settledHeights = new Map<string, number>();
/** First open: room for a roles block plus one agent row (what a typical page settles at). */
const DEFAULT_RESERVED_HEIGHT = 176;
/** The roles block: its label line, then one 28px row per role with a 2px gap (see the markup below). */
const ROLE_BLOCK_LABEL_HEIGHT = 18;
const ROLE_ROW_PITCH = 30;
const ROLE_ROW_GAP = 2;

export function SurfaceBoundAgentsList({
  surfaceName,
  onRunAgent,
  runDisabled = false,
  hideWhenEmpty = false,
  isEditable = false,
  includeDefaults = true,
  includeRoles = true,
  className,
  emptyMessage = "No agents bound yet. Add one to run it here.",
  addLabel = "Add custom agent",
}: SurfaceBoundAgentsListProps) {
  const surfaceLabel = getSurfaceDisplayLabel(surfaceName);
  const openBind = useOpenSurfaceAgentBindWindow();
  const openSettings = useOpenAgentSettingsWindow();
  // A launch reads the page's live scope and the agent before anything opens
  // (~3 s on a phone, PB-08 2026-10-01) — the pressed row spins meanwhile and
  // a second press is ignored instead of the tap looking dead.
  const [startingId, setStartingId] = useState<string | null>(null);
  const run = (agentId: string) => {
    if (runDisabled || startingId) return;
    setStartingId(agentId);
    void Promise.resolve(onRunAgent(agentId)).finally(() => setStartingId(null));
  };
  const { sections, loading, settled, error, hasAgents, refresh } = useSurfaceBoundAgents(
    surfaceName,
    { isEditable, includeDefaults },
  );

  // Role-bound agents (ui.ui_surface_agent_role) — definition-tier agents with
  // no agent.card row or associations edge still surface here.
  const { roles, status: rolesStatus } = useSurfaceAgentRoles(surfaceName);
  const roleRows = includeRoles
    ? Object.values(roles)
        .filter((v) => v.effectiveAgentId !== null)
        .sort((a, b) => (a.role.sortOrder ?? 0) - (b.role.sortOrder ?? 0))
    : [];
  const roleAgentNames = useAgentNames(
    roleRows.map((v) => v.effectiveAgentId as string),
  );
  const hasRoleRows = roleRows.length > 0;

  const [detachTarget, setDetachTarget] =
    useState<SurfaceBoundAgentEntry | null>(null);
  const [detachBusy, setDetachBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Both reads settled: the list has its final rows. Remember that height for the next open of this surface.
  const rolesSettled = rolesStatus === "ready" || rolesStatus === "error";
  const pendingRoleCount = getSurfaceIndexEntry(surfaceName)?.agentRoleCount ?? 0;
  const ready = settled && !loading && (!includeRoles || rolesSettled);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ready && rootRef.current) settledHeights.set(surfaceName, rootRef.current.offsetHeight);
  });

  const handleAdd = () => {
    openBind({
      surfaceName,
      onBound: () => {
        void refresh();
      },
    });
  };

  if (hideWhenEmpty && settled && !loading && !error && !hasAgents && !hasRoleRows) return null;

  // A manifest role may intentionally point at the same agent as a direct
  // association: the role declares that the surface USES the agent, while the
  // association carries its value_mappings. Render that identity once under
  // Surface roles instead of showing a duplicate row under Public/Org/Mine.
  const roleAgentIds = new Set(
    roleRows.map((view) => view.effectiveAgentId as string),
  );
  const visibleSections = sections
    .map((section) => ({
      ...section,
      agents: section.agents.filter(
        (agent) => !roleAgentIds.has(agent.agentId),
      ),
    }))
    .filter((section) => section.agents.length > 0);

  return (
    <div
      ref={rootRef}
      className={cn("space-y-3", className)}
      // Reserve the final size until BOTH reads (bound agents, surface roles) settle, so the sections
      // below do not jump when the rows arrive.
      style={ready ? undefined : { minHeight: settledHeights.get(surfaceName) ?? DEFAULT_RESERVED_HEIGHT }}
    >
      {loading && !hasAgents && (
        <div className="flex items-center justify-center gap-2 py-4 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading agents…
        </div>
      )}

      {!loading && error && !hasAgents && (
        <ReadFailure
          error={error}
          what="the agents on this surface"
          onRetry={() => void refresh()}
          className="m-0"
        />
      )}

      {!loading && !error && !hasAgents && !hasRoleRows && (
        <p className="rounded-md border border-dashed border-border px-2.5 py-3 text-center text-[10px] text-muted-foreground">
          {emptyMessage}
        </p>
      )}

      {/* The index already says how many roles this surface declares: hold their space while the read lands. */}
      {includeRoles && !hasRoleRows && !rolesSettled && pendingRoleCount > 0 && (
        <div aria-hidden="true" style={{ height: ROLE_BLOCK_LABEL_HEIGHT + pendingRoleCount * ROLE_ROW_PITCH - ROLE_ROW_GAP }} />
      )}

      {hasRoleRows && (
        <div className="space-y-1">
          <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Surface roles
          </p>
          <div className="space-y-0.5">
            {roleRows.map((view) => {
              const agentId = view.effectiveAgentId as string;
              const agentName = roleAgentNames[agentId];
              return (
                <div
                  key={`role:${view.role.name}`}
                  onClick={() => {
                    run(agentId);
                  }}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-1.5"
                >
                  <button
                    type="button"
                    title={`Run ${agentName ?? view.role.label}`}
                    aria-label={`Run ${agentName ?? view.role.label}`}
                    disabled={runDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      run(agentId);
                    }}
                    aria-busy={startingId === agentId}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {startingId === agentId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                  </button>
                  <EntityRef
                    token="agent"
                    id={agentId}
                    name={agentName ?? view.role.label}
                    showIcon={false}
                    fill
                    disablePeek
                    onOpen={() => {
                      run(agentId);
                    }}
                    className="min-w-0 flex-1 text-xs font-medium leading-none"
                  >
                    <span className="truncate">
                      {view.role.label}
                      {agentName && agentName !== view.role.label && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {agentName}
                        </span>
                      )}
                    </span>
                  </EntityRef>
                  <button
                    type="button"
                    title={`Settings for ${agentName ?? view.role.label}`}
                    aria-label={`Settings for ${agentName ?? view.role.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openSettings({
                        initialAgentId: agentId,
                        surfaceName,
                      });
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleSections.map((section) => (
        <div key={section.key} className="space-y-1">
          <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.agents.map((a) => (
              <div
                key={`${section.key}:${a.agentId}`}
                onClick={() => {
                  run(a.agentId);
                }}
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-1.5"
              >
                <button
                  type="button"
                  title={`Run ${a.name}`}
                  aria-label={`Run ${a.name}`}
                  disabled={runDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    run(a.agentId);
                  }}
                  aria-busy={startingId === a.agentId}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  {startingId === a.agentId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3 fill-current" />
                  )}
                </button>
                <EntityRef
                  token="agent"
                  id={a.agentId}
                  name={a.name}
                  showIcon={false}
                  fill
                  disablePeek
                  onOpen={() => {
                    run(a.agentId);
                  }}
                  className="min-w-0 flex-1 text-xs font-medium leading-none"
                />
                {a.organizationName ? (
                  <span className="max-w-[40%] shrink-0 truncate text-[10px] text-muted-foreground">
                    {a.organizationName}
                  </span>
                ) : null}
                <button
                  type="button"
                  title={`Settings for ${a.name}`}
                  aria-label={`Settings for ${a.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSettings({
                      initialAgentId: a.agentId,
                      surfaceName,
                    });
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Settings className="h-3 w-3" />
                </button>
                {a.canDetach && (
                  <button
                    type="button"
                    title={`Remove ${a.name} from ${surfaceLabel}`}
                    aria-label={`Remove ${a.name} from ${surfaceLabel}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDetachTarget(a);
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive-ink transition-colors"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-2 text-[10px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" />
        <span>{addLabel}</span>
      </button>

      <ConfirmDialog
        open={!!detachTarget}
        onOpenChange={(open) => {
          if (!open && !detachBusy) setDetachTarget(null);
        }}
        title="Remove from surface"
        description={
          <>
            Remove{" "}
            {detachTarget ? (
              <EntityRef
                token="agent"
                id={detachTarget.agentId}
                name={detachTarget.name}
                showIcon={false}
                openInNewTab
                labelClassName="font-semibold"
              />
            ) : null}{" "}
            {/* read-gate-exempt: confirmation copy for removing an agent, not an empty view of any read */}
            from <b>{surfaceLabel}</b>? It will no longer appear here or in this
            surface&apos;s context menu.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        busy={detachBusy}
        onConfirm={async () => {
          if (!detachTarget) return;
          setDetachBusy(true);
          try {
            await deleteAgentSurfaceBinding(detachTarget.bindingId);
            toast.success(`Removed from ${surfaceLabel}`);
            setDetachTarget(null);
            void refresh();
          } catch (e) {
            (isCapturedSurfaceRegistrationError(e)
              ? toastErrorAlreadyCaptured
              : toast.error)(
              e instanceof Error || isSurfaceRegistrationError(e)
                ? e.message
                : "Could not remove agent",
            );
          } finally {
            setDetachBusy(false);
          }
        }}
      />
    </div>
  );
}
