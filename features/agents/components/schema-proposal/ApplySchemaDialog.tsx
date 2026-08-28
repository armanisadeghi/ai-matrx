"use client";

/**
 * ApplySchemaDialog — pick one of the user's agents and write a proposed
 * output schema to its `agent.definition.output_schema`.
 *
 * Reuses the canonical agent picker and data paths — never a parallel roster:
 *   - picker: `AgentListDropdown` (the same control as the chat header).
 *   - write: `saveAgentField({ field: "outputSchema" })` thunk (optimistic +
 *            rollback, hits `agent.definition` via the standard converter). RLS gates
 *            the write; a denied update surfaces loudly as a toast.error.
 *
 * Standard `@/components/ui/dialog` (Radix). No browser dialogs.
 */

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import type { OutputSchema } from "@/features/agents/types/json-schema";

interface ApplySchemaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The proposed schema envelope ({ name, schema, strict? }) to write. */
  schema: OutputSchema;
}

const WRITABLE_AGENT_TABS = ["mine"] as const;

export const ApplySchemaDialog: React.FC<ApplySchemaDialogProps> = ({
  open,
  onOpenChange,
  schema,
}) => {
  const dispatch = useAppDispatch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const selectedAgent = useAppSelector((state) =>
    selectedId ? selectAgentById(state, selectedId) : undefined,
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectedId(null);
    onOpenChange(nextOpen);
  };

  const handleApply = async () => {
    if (!selectedAgent || applying) return;
    setApplying(true);
    try {
      await dispatch(
        saveAgentField({
          agentId: selectedAgent.id,
          field: "outputSchema",
          value: schema,
        }),
      ).unwrap();
      toast.success(`Updated ${selectedAgent.name} output schema`, {
        action: toastDoor("agent", selectedAgent.id),
      });
      handleOpenChange(false);
      setSelectedId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update output schema",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply output schema</DialogTitle>
          <DialogDescription>
            Pick an agent to set its structured-output schema to{" "}
            <span className="font-medium text-foreground">{schema.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <AgentListDropdown
          consumerId="apply-schema-agent-picker"
          onSelect={setSelectedId}
          label={selectedAgent?.name ?? "Select an agent"}
          activeAgentId={selectedId}
          initialTab="mine"
          visibleTabs={WRITABLE_AGENT_TABS}
          showPinnedAgent={false}
          className="h-10 w-full justify-between text-sm"
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selectedAgent || applying}>
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply schema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplySchemaDialog;
