"use client";

// features/agents/browse/components/AddToOrchestraDialog.tsx
//
// Dialog form of "add this agent to an Orchestra". The existing AddToOrchestraMenu renders
// its OWN dropdown trigger, so it cannot be reached from a menu entry — but its
// logic can: this reuses the same `useOrchestrasList` hook and `addAgentToOrchestra`
// thunk, and only supplies a different shell. No duplicated business logic.

import { useState } from "react";
import { Network, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { addAgentToOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { useOrchestrasList } from "@/features/agents/orchestras/hooks/useOrchestrasList";

interface Props {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
}

export function AddToOrchestraDialog({
  agentId,
  agentName,
  open,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const { orchestras, status } = useOrchestrasList();
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async (orchestratorId: string, name: string) => {
    setBusyId(orchestratorId);
    const res = await dispatch(
      addAgentToOrchestra({ orchestratorId, agentId }),
    );
    setBusyId(null);
    if (res.ok) {
      toast.success(`Added to "${name}"`);
      onClose();
    } else {
      toast.error(res.error ?? "Could not add to Orchestra");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Orchestra</DialogTitle>
          <DialogDescription className="truncate">
            {agentName}
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && orchestras.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <SuspenseLoader centered={false} message="Loading orchestras…" />
          </div>
        ) : orchestras.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You don&apos;t have any Orchestras yet.
          </p>
        ) : (
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {orchestras.map((orchestra) => {
              // An Orchestra IS its orchestrator agent — `orchestratorId` is the id,
              // and `label` overrides the orchestrator's name when authored.
              const orchestraLabel = orchestra.label ?? orchestra.name;
              return (
                <div key={orchestra.orchestratorId} className="group relative">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void add(orchestra.orchestratorId, orchestraLabel)
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 pr-16 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {busyId === orchestra.orchestratorId ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{orchestraLabel}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {orchestra.memberCount}
                    </span>
                  </button>
                  {/* THE DOOR LAW: an Orchestra IS its orchestrator agent, and the user
                      is being asked to pick one with nothing but a label to go
                      on. Doors are an absolutely-positioned SIBLING because the
                      row is a `<button>` whose click means "attach" — a nested
                      anchor or button is invalid DOM, and a stray click that
                      navigated would cost the user the picker. `pr-16` on the
                      button reserves the space so these never sit on top of the
                      member count. Same shape as LinkAgentToShortcutModal. */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <EntityDoorControls
                      token="agent"
                      id={orchestra.orchestratorId}
                      name={orchestraLabel}
                      alwaysShowActions
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
