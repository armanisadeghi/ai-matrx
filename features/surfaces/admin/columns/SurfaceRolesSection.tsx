"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Users } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  useSurfaceAgentRoles,
  type RoleView,
} from "@/features/surfaces/hooks/useSurfaceConfig";
import { useAgentNames } from "@/features/surfaces/hooks/useAgentNames";

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
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const roleList = Object.values(roles).sort(
    (a, b) => (a.role.sortOrder ?? 0) - (b.role.sortOrder ?? 0),
  );

  const nameIds = new Set<string>([agent.id]);
  for (const view of Object.values(roles)) {
    if (view.role.defaultAgentId) nameIds.add(view.role.defaultAgentId);
    if (view.effectiveAgentId) nameIds.add(view.effectiveAgentId);
    if (view.userSelection?.agentId) nameIds.add(view.userSelection.agentId);
    for (const o of view.orgSelections) nameIds.add(o.agentId);
    for (const e of view.effective) nameIds.add(e.agentId);
    for (const r of view.roster) nameIds.add(r.agentId);
  }
  const agentNames = useAgentNames([...nameIds]);

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
    <div className="shrink-0 mx-3 mt-3 rounded-xl border border-border bg-card/60 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Users className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Agent roles
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-foreground tabular-nums">
          {roleList.length}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="max-h-[38dvh] overflow-auto border-t border-border p-2.5 space-y-2">
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
      )}
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
