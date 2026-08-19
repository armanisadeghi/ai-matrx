// features/agents/orchestras/components/AddToOrchestraMenu.tsx
//
// A compact "add this agent to an Orchestra" control for agent cards / rows. Lists the
// user's existing Orchestras (click → add as member) and offers to start a new Orchestra
// seeded with this agent. Self-contained: renders its own trigger + dialog.

"use client";

import { useState } from "react";
import { Network, Plus, ListTree } from "lucide-react";
import { useRouter } from "next/navigation";
import IconButton from "@/components/official/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast-service";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchOrchestras,
  addAgentToOrchestra,
} from "@/features/agents/redux/orchestras/thunks";
import { useOrchestrasList } from "../hooks/useOrchestrasList";
import { CreateOrchestraDialog } from "./CreateOrchestraDialog";
import { accentClasses } from "./accents";
import { cn } from "@/lib/utils";

export function AddToOrchestraMenu({
  agentId,
  disabled,
}: {
  agentId: string;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { orchestras } = useOrchestrasList({ auto: false });
  const [createOpen, setCreateOpen] = useState(false);

  const addTo = async (orchestratorId: string, name: string) => {
    const res = await dispatch(
      addAgentToOrchestra({ orchestratorId, agentId }),
    );
    if (res.ok) toast.success(`Added to “${name}”.`);
    else toast.error(res.error ?? "Could not add to Orchestra.");
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) dispatch(fetchOrchestras());
        }}
      >
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <IconButton
            icon={Network}
            tooltip="Add to Orchestra"
            size="sm"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            disabled={disabled}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel>Add to Orchestra</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => setCreateOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Orchestra with this agent…
          </DropdownMenuItem>
          {orchestras.length > 0 && <DropdownMenuSeparator />}
          {orchestras.slice(0, 8).map((orchestra) => {
            const a = accentClasses(orchestra.config.accent);
            return (
              <DropdownMenuItem
                key={orchestra.orchestratorId}
                onSelect={() =>
                  addTo(
                    orchestra.orchestratorId,
                    orchestra.label || orchestra.name,
                  )
                }
                className="gap-2"
              >
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", a.dot)}
                />
                <span className="truncate">
                  {orchestra.label || orchestra.name}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {orchestra.memberCount}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => router.push("/agents/orchestras")}
            className="gap-2"
          >
            <ListTree className="h-4 w-4" />
            Browse all Orchestras
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mount only when open — CreateOrchestraDialog calls useEnsureAgentsLoaded on
          mount, and AgentCard puts this menu on every row. Eager mount was
          stampeding agx_get_list_full (N cards → N parallel full-list RPCs). */}
      {createOpen ? (
        <CreateOrchestraDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          seedMemberId={agentId}
        />
      ) : null}
    </>
  );
}
