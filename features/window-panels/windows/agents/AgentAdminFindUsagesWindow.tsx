"use client";

/**
 * AgentAdminFindUsagesWindow — the super-admin "Find Usages (Admin)" window.
 *
 * Same engine as the user window, in admin mode: every user's usages in full
 * detail, with filters and an "Inform all affected users" bulk-DM action.
 * Gated by selectIsSuperAdmin at the menu (AgentOptionsMenu) and enforced
 * server-side by agx_usage_scan_admin's is_super_admin() check; this body
 * carries a defensive guard in case it is ever opened ungated.
 */

import { useCallback, useState } from "react";
import { ShieldOff, ShieldCheck } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import { AgentUsagesEngine } from "@/features/agents/components/usages/AgentUsagesEngine";

interface AgentAdminFindUsagesWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
}

export function AgentAdminFindUsagesWindow({
  isOpen,
  onClose,
  agentId,
}: AgentAdminFindUsagesWindowProps) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [selectedId, setSelectedId] = useState<string | null>(agentId ?? null);
  const effectiveId = selectedId ?? agentId ?? null;

  const agentName = useAppSelector((s: RootState) =>
    effectiveId ? (selectAgentName(s, effectiveId) ?? null) : null,
  );

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  if (!isOpen) return null;

  return (
    <WindowPanel
      id="agent-admin-find-usages-window"
      overlayId="agentAdminFindUsagesWindow"
      titleNode={
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Find Usages (Admin)
          </span>
          <AgentListDropdown
            onSelect={handleSelect}
            label={effectiveId ? (agentName ?? "Agent") : "Select agent…"}
            noBorder
            compact
            className="max-w-[180px] rounded-none bg-transparent md:max-w-[240px]"
          />
        </div>
      }
      onClose={onClose}
      width={1080}
      height={760}
      minWidth={560}
      minHeight={420}
      bodyClassName="p-0"
    >
      {!isSuperAdmin ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <ShieldOff className="h-12 w-12 opacity-20" aria-hidden />
          <p className="text-sm font-medium text-foreground">Super admin required</p>
          <p className="text-xs opacity-60">
            The system-wide usage view is restricted to super admins.
          </p>
        </div>
      ) : effectiveId ? (
        <AgentUsagesEngine key={effectiveId} agentId={effectiveId} mode="admin" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <ShieldCheck className="h-12 w-12 opacity-15" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Pick an agent</p>
            <p className="text-xs opacity-60">
              Choose an agent to see every usage across all users and orgs.
            </p>
          </div>
        </div>
      )}
    </WindowPanel>
  );
}
