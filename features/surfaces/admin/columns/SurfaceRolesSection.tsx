"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/styles/themes/utils";
import { createClient } from "@/utils/supabase/client";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  useSurfaceAgentRoles,
  type RoleView,
} from "@/features/surfaces/hooks/useSurfaceConfig";

/**
 * Agent roles for the selected surface — mounted at the top of the surface
 * details column. One compact row per declared role: the role label (with
 * its description on hover), the default chain as tier chips (Platform /
 * Org / You — the effective tier highlighted), and a one-click action that
 * sets the page's agent as the caller's user-tier selection for that role.
 * Org-tier writes are deferred until the surfaces hub lands.
 */
export function SurfaceRolesSection({
  surfaceName,
  agent,
}: {
  surfaceName: string;
  agent: AgentDefinition;
}) {
  const { status, roles } = useSurfaceAgentRoles(surfaceName);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const roleList = Object.values(roles).sort(
    (a, b) => a.role.sortOrder - b.role.sortOrder,
  );

  // Resolve display names for every agent id the chips reference.
  useEffect(() => {
    const ids = new Set<string>();
    for (const view of Object.values(roles)) {
      if (view.role.defaultAgentId) ids.add(view.role.defaultAgentId);
      for (const e of view.effective) ids.add(e.agentId);
    }
    const missing = [...ids].filter((id) => !agentNames[id]);
    if (missing.length === 0) return;
    void (async () => {
      const { data, error } = await createClient()
        .from("agx_agent")
        .select("id, name")
        .in("id", missing);
      if (error || !data) return;
      setAgentNames((prev) => ({
        ...prev,
        ...Object.fromEntries(
          (data as { id: string; name: string | null }[]).map((r) => [
            r.id,
            r.name ?? "Unnamed agent",
          ]),
        ),
      }));
    })();
  }, [roles, agentNames]);

  const handleUseForMe = async (view: RoleView) => {
    setBusyRole(view.role.name);
    try {
      await view.setForMe(agent.id);
      toast.success(`${agent.name} is now your ${view.role.label} agent`);
    } catch (err) {
      console.error("[surfaces] setForMe failed:", err);
      toast.error("Could not save your selection");
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <section className="shrink-0 mx-3 mt-3 rounded-xl border border-border bg-card shadow-sm">
      <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Agent roles
      </div>
      {status === "loading" && roleList.length === 0 ? (
        <div className="px-3 pb-2.5 text-xs text-muted-foreground">
          Loading roles…
        </div>
      ) : roleList.length === 0 ? (
        <p className="px-3 pb-2.5 text-xs text-muted-foreground italic">
          This surface declares no agent roles.
        </p>
      ) : (
        <ul className="px-3 pb-2.5 space-y-1.5">
          {roleList.map((view) => (
            <RoleRow
              key={view.role.name}
              view={view}
              names={agentNames}
              busy={busyRole === view.role.name}
              onUseForMe={() => void handleUseForMe(view)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RoleRow({
  view,
  names,
  busy,
  onUseForMe,
}: {
  view: RoleView;
  names: Record<string, string>;
  busy: boolean;
  onUseForMe: () => void;
}) {
  const tier = view.sourceTier;
  const platformName = view.role.defaultAgentId
    ? (names[view.role.defaultAgentId] ?? view.role.defaultAgentId.slice(0, 8))
    : null;

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className="text-xs font-medium text-foreground"
        title={view.role.description || undefined}
      >
        {view.role.label}
      </span>
      <span className="flex items-center gap-1">
        <TierChip
          label={platformName ? `Platform: ${platformName}` : "Platform: —"}
          active={tier === "manifest" || tier === "global"}
        />
        <TierChip label="Org" active={tier === "org"} />
        <TierChip label="You" active={tier === "user"} />
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onUseForMe}
          disabled={busy}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserRoundCheck className="h-3 w-3" />
          )}
          Use this agent → For me
        </button>
        <button
          type="button"
          disabled
          title="Org scope lands with the hub"
          className="inline-flex h-6 cursor-not-allowed items-center rounded-md border border-border/50 bg-muted/20 px-2 text-[11px] font-medium text-muted-foreground/45"
        >
          For my org
        </button>
      </span>
    </li>
  );
}

function TierChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium",
        active
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground/60",
      )}
      title={active ? "Effective tier" : undefined}
    >
      {label}
    </span>
  );
}
