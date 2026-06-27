"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/utils/supabase/client";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  useSurfaceAgentRoles,
  type RoleView,
} from "@/features/surfaces/hooks/useSurfaceConfig";

type MeAgentMode = "exclude" | "roster" | "default";

function agentName(names: Record<string, string>, id: string | null): string {
  if (!id) return "—";
  return names[id] ?? `${id.slice(0, 8)}…`;
}

function activeTierLabel(
  tier: RoleView["sourceTier"],
): "Platform" | "Organization" | "You" | "—" {
  if (tier === "user") return "You";
  if (tier === "org") return "Organization";
  if (tier === "manifest" || tier === "global") return "Platform";
  return "—";
}

function meModeForAgent(view: RoleView, agentId: string): MeAgentMode {
  if (view.userSelection?.agentId === agentId) return "default";
  const rosterHit = view.roster.find(
    (r) => r.sourceTier === "user" && r.agentId === agentId,
  );
  if (rosterHit) return "roster";
  return "exclude";
}

function userRosterPrefId(view: RoleView, agentId: string): string | null {
  return (
    view.roster.find((r) => r.sourceTier === "user" && r.agentId === agentId)
      ?.prefId ?? null
  );
}

export function SurfaceRolesSection({
  surfaceName,
  agent,
}: {
  surfaceName: string;
  agent: AgentDefinition;
}) {
  const { status, roles, refresh } = useSurfaceAgentRoles(surfaceName);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const roleList = Object.values(roles).sort(
    (a, b) => a.role.sortOrder - b.role.sortOrder,
  );

  useEffect(() => {
    const ids = new Set<string>();
    for (const view of Object.values(roles)) {
      if (view.role.defaultAgentId) ids.add(view.role.defaultAgentId);
      if (view.effectiveAgentId) ids.add(view.effectiveAgentId);
      if (view.userSelection?.agentId) ids.add(view.userSelection.agentId);
      for (const o of view.orgSelections) ids.add(o.agentId);
      for (const e of view.effective) ids.add(e.agentId);
      for (const r of view.roster) ids.add(r.agentId);
    }
    ids.add(agent.id);
    const missing = [...ids].filter((id) => !agentNames[id]);
    if (missing.length === 0) return;
    void (async () => {
      const { data, error } = await createClient()
        .schema("agent")
        .from("definition")
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
  }, [roles, agentNames, agent.id]);

  const handleMeModeChange = async (view: RoleView, mode: MeAgentMode) => {
    setBusyRole(view.role.name);
    try {
      const current = meModeForAgent(view, agent.id);
      if (current === mode) return;

      if (current === "default") await view.clearForMe();
      const rosterId = userRosterPrefId(view, agent.id);
      if (current === "roster" && rosterId) {
        await view.removeFromMyRoster(rosterId);
      }

      if (mode === "default") {
        await view.setForMe(agent.id);
        toast.success("Saved");
      } else if (mode === "roster") {
        await view.addToMyRoster(agent.id);
        toast.success("Saved");
      } else {
        toast.success("Saved");
      }
      refresh();
    } catch (err) {
      console.error("[surfaces] me mode change failed:", err);
      toast.error("Could not save");
    } finally {
      setBusyRole(null);
    }
  };

  if (status === "loading" && roleList.length === 0) {
    return (
      <div className="shrink-0 mx-3 mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1.5" />
        Loading…
      </div>
    );
  }

  if (roleList.length === 0) return null;

  return (
    <div className="shrink-0 mx-3 mt-3 space-y-2">
      {roleList.map((view) => (
        <RoleCard
          key={view.role.name}
          view={view}
          agent={agent}
          names={agentNames}
          busy={busyRole === view.role.name}
          onMeModeChange={(mode) => void handleMeModeChange(view, mode)}
        />
      ))}
    </div>
  );
}

function RoleCard({
  view,
  agent,
  names,
  busy,
  onMeModeChange,
}: {
  view: RoleView;
  agent: AgentDefinition;
  names: Record<string, string>;
  busy: boolean;
  onMeModeChange: (mode: MeAgentMode) => void;
}) {
  const activeVia = activeTierLabel(view.sourceTier);
  const meMode = meModeForAgent(view, agent.id);

  return (
    <section className="rounded-lg border border-border bg-card px-2.5 py-2 space-y-1.5">
      <h3 className="text-xs font-semibold text-foreground">
        {view.role.label}
      </h3>

      <Row
        label="Platform"
        value={agentName(names, view.role.defaultAgentId)}
      />
      <Row
        label="Active"
        value={`${agentName(names, view.effectiveAgentId)} · ${activeVia}`}
      />
      <Row label="Me">
        <Select
          value={meMode}
          disabled={busy}
          onValueChange={(v) => onMeModeChange(v as MeAgentMode)}
        >
          <SelectTrigger className="h-7 w-full text-xs">
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exclude">Do not include</SelectItem>
            <SelectItem value="roster">Show as option</SelectItem>
            <SelectItem value="default">Set as default</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Org" value="—" />
    </section>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2 min-h-7">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children ?? (
        <span className="text-xs text-foreground truncate">{value}</span>
      )}
    </div>
  );
}
