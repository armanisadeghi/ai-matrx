"use client";

/**
 * ApplySchemaDialog — pick one of the user's agents and write a proposed
 * output schema to its `agx_agent.output_schema`.
 *
 * Reuses the canonical agent data paths — never a parallel store:
 *   - list:  `fetchAgentsListFull` thunk + `selectAllAgents` selector.
 *   - write: `saveAgentField({ field: "outputSchema" })` thunk (optimistic +
 *            rollback, hits `agx_agent` via the standard converter). RLS gates
 *            the write; a denied update surfaces loudly as a toast.error.
 *
 * Standard `@/components/ui/dialog` (Radix). Searchable list via `cmdk`
 * (`@/components/ui/command`). No browser dialogs.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchAgentsListFull,
  saveAgentField,
} from "@/features/agents/redux/agent-definition/thunks";
import type { OutputSchema } from "@/features/agents/types/json-schema";

interface ApplySchemaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The proposed schema envelope ({ name, schema, strict? }) to write. */
  schema: OutputSchema;
}

interface PickableAgent {
  id: string;
  name: string;
}

export const ApplySchemaDialog: React.FC<ApplySchemaDialogProps> = ({
  open,
  onOpenChange,
  schema,
}) => {
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgents);

  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Load the agent list once per open. Reuses the canonical full-list thunk so
  // pickers, dropdowns, and this dialog all share one source of truth.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void dispatch(fetchAgentsListFull())
      .unwrap()
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Failed to load agents",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, dispatch]);

  // Only the user's own, live (non-version, non-archived) agents are writable.
  // Builtins and shared records are excluded — RLS would reject the write and
  // they aren't the user's to repurpose.
  const pickable = useMemo<PickableAgent[]>(() => {
    const rows = Object.values(agents)
      .filter(
        (a) =>
          a &&
          !a.isVersion &&
          a.agentType === "user" &&
          !a.isArchived &&
          a.isOwner !== false,
      )
      .map((a) => ({ id: a.id, name: a.name || "Untitled agent" }));
    rows.sort((x, y) => x.name.localeCompare(y.name));
    return rows;
  }, [agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter((a) => a.name.toLowerCase().includes(q));
  }, [pickable, query]);

  const selectedAgent = pickable.find((a) => a.id === selectedId) ?? null;

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
      toast.success(`Updated ${selectedAgent.name} output schema`);
      onOpenChange(false);
      setSelectedId(null);
      setQuery("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update output schema",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply output schema</DialogTitle>
          <DialogDescription>
            Pick an agent to set its structured-output schema to{" "}
            <span className="font-medium text-foreground">{schema.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <ScrollArea className="h-64 rounded-md border border-border">
          {loading ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading agents…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              {pickable.length === 0
                ? "No editable agents found."
                : "No agents match your search."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((agent) => {
                const isSelected = agent.id === selectedId;
                return (
                  <li key={agent.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(agent.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                        "hover:bg-accent",
                        isSelected && "bg-accent",
                      )}
                    >
                      <span className="truncate text-foreground">
                        {agent.name}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
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
