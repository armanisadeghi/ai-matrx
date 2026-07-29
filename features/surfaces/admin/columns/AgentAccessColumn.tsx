"use client";

/**
 * Column 5 — Agent access (write policies).
 *
 * Converted from the old Playground stub. For the selected surface (+ its
 * binding for this agent) it lists the surface's declared `writeTargets` and
 * lets the user override each target's apply policy
 * (Default / Manual / Ask / Auto) on the binding's `write_policies`
 * (surface_binding payload v2), saved through the same associations-backed
 * upsert thunk as the mapping form.
 *
 * Round-trip rule: the edge payload is replaced wholesale on save, so the
 * save always carries the binding's current value mappings plus the FULL
 * edited policy map. Editing policies on a surface with no binding yet
 * creates a user-tier binding whose only content is the overrides — the
 * launch-time layer resolver keeps mapping-less policy layers.
 */

import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { WritePolicyEditor } from "@/features/surfaces/components/bind/WritePolicyEditor";
import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  loadBindingsForAgent,
  upsertAgentSurfaceBindingThunk,
} from "@/features/surfaces/redux/thunks";
import { makeSelectBindingsForAgent } from "@/features/surfaces/redux/selectors";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import type { WritePolicyMap } from "@/features/surfaces/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { useSurfacesAdminSelection } from "../useSurfacesAdminSelection";

export function AgentAccessColumn({ agent }: { agent: AgentDefinition }) {
  const { surfaceName, bindingId } = useSurfacesAdminSelection();
  const dispatch = useAppDispatch();
  const currentUserId = useAppSelector((s) => s.userAuth?.id ?? null);

  const selectBindings = useMemo(
    () => makeSelectBindingsForAgent(agent.id),
    [agent.id],
  );
  const allBindings = useAppSelector(selectBindings);

  useEffect(() => {
    void dispatch(loadBindingsForAgent({ agentId: agent.id }));
  }, [dispatch, agent.id]);

  // Same binding-resolution order as BindingColumn: explicit ?binding=,
  // else auto-adopt the surface's existing binding (current user's tier
  // preferred) so both columns always talk about the SAME row.
  const existing = useMemo(() => {
    if (bindingId) {
      return allBindings.find((b) => b.id === bindingId) ?? null;
    }
    if (!surfaceName) return null;
    const forSurface = allBindings.filter((b) => b.surfaceName === surfaceName);
    if (forSurface.length === 0) return null;
    return (
      forSurface.find((b) => b.userId && b.userId === currentUserId) ??
      forSurface[0]
    );
  }, [allBindings, bindingId, surfaceName, currentUserId]);

  return (
    <div className="h-full flex flex-col bg-muted pt-[var(--shell-header-h)]">
      <div className="shrink-0 px-3 pt-1.5 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Agent access
        </div>
      </div>

      {!surfaceName ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center">
          <div className="rounded-full bg-background p-2.5 mb-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-foreground">Pick a surface</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Select a surface to control which of its fields this agent may
            write, and whether it must ask first.
          </p>
        </div>
      ) : (
        <AgentAccessForm
          key={`${surfaceName}::${existing?.id ?? "new"}`}
          agent={agent}
          surfaceName={surfaceName}
          existing={existing}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

function AgentAccessForm({
  agent,
  surfaceName,
  existing,
  currentUserId,
}: {
  agent: AgentDefinition;
  surfaceName: string;
  existing:
    | import("@/features/surfaces/services/bind-agent-to-surface.service").AgentSurfaceBinding
    | null;
  currentUserId: string | null;
}) {
  const dispatch = useAppDispatch();
  const [policies, setPolicies] = useState<WritePolicyMap>(() => ({
    ...(existing?.writePolicies ?? {}),
  }));
  const [busy, setBusy] = useState(false);

  const declaresTargets =
    (getManifest(surfaceName)?.writeTargets?.length ?? 0) > 0;

  const dirty = useMemo(() => {
    const saved = existing?.writePolicies ?? {};
    const keys = new Set([...Object.keys(saved), ...Object.keys(policies)]);
    for (const k of keys) {
      if (saved[k] !== policies[k]) return true;
    }
    return false;
  }, [existing, policies]);

  const onSave = async () => {
    if (!existing && !currentUserId) {
      toast.error("No binding to attach overrides to and no signed-in user");
      return;
    }
    setBusy(true);
    try {
      await dispatch(
        upsertAgentSurfaceBindingThunk({
          agentId: agent.id,
          surfaceName,
          // Existing binding: keep its tier + mappings, replace policies.
          // No binding yet: create a user-tier binding that carries only
          // the overrides (a mapping-less policy layer is a real layer).
          scope: existing
            ? {
                userId: existing.userId,
                organizationId: existing.organizationId,
                projectId: existing.projectId,
                taskId: existing.taskId,
              }
            : { userId: currentUserId },
          valueMappings: existing?.valueMappings ?? {},
          writePolicies: policies,
        }),
      ).unwrap();
      toast.success("Agent access saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
        <div>
          <p className="text-xs font-medium text-foreground">
            {getSurfaceDisplayLabel(surfaceName)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            {existing
              ? "Overrides apply to this binding and merge over the surface defaults at launch."
              : declaresTargets
                ? "No binding exists yet — saving an override creates a personal binding carrying only these policies."
                : null}
          </p>
        </div>

        <WritePolicyEditor
          surfaceName={surfaceName}
          value={policies}
          onChange={setPolicies}
          disabled={busy}
        />
      </div>

      {declaresTargets && (
        <footer className="shrink-0 px-3 py-2 border-t border-border bg-muted flex items-center">
          <Button
            onClick={() => void onSave()}
            disabled={busy || !dirty}
            className="ml-auto h-8 gap-1.5 text-xs min-w-[90px]"
            size="sm"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </footer>
      )}
    </>
  );
}
