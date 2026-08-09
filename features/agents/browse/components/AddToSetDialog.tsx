"use client";

// features/agents/browse/components/AddToSetDialog.tsx
//
// Dialog form of "add this agent to a set". The existing AddToSetMenu renders
// its OWN dropdown trigger, so it cannot be reached from a menu entry — but its
// logic can: this reuses the same `useAgentSetsList` hook and `addAgentToSet`
// thunk, and only supplies a different shell. No duplicated business logic.

import { useState } from "react";
import { Network, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { addAgentToSet } from "@/features/agents/redux/agent-sets/thunks";
import { useAgentSetsList } from "@/features/agents/agent-sets/hooks/useAgentSetsList";

interface Props {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
}

export function AddToSetDialog({ agentId, agentName, open, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { sets, status } = useAgentSetsList();
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async (orchestratorId: string, name: string) => {
    setBusyId(orchestratorId);
    const res = await dispatch(addAgentToSet({ orchestratorId, agentId }));
    setBusyId(null);
    if (res.ok) {
      toast.success(`Added to "${name}"`);
      onClose();
    } else {
      toast.error(res.error ?? "Could not add to set");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to set</DialogTitle>
          <DialogDescription className="truncate">{agentName}</DialogDescription>
        </DialogHeader>

        {status === "loading" && sets.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You don&apos;t have any sets yet.
          </p>
        ) : (
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {sets.map((set) => {
              // A set IS its orchestrator agent — `orchestratorId` is the id,
              // and `label` overrides the orchestrator's name when authored.
              const setLabel = set.label ?? set.name;
              return (
                <div key={set.orchestratorId} className="group relative">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void add(set.orchestratorId, setLabel)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 pr-16 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {busyId === set.orchestratorId ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Network className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{setLabel}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {set.memberCount}
                    </span>
                  </button>
                  {/* THE DOOR LAW: a set IS its orchestrator agent, and the user
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
                      id={set.orchestratorId}
                      name={setLabel}
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
