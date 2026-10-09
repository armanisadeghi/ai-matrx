"use client";

import { ErrorNotice } from "@ai-matrx/design-system";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { addAgentToRoom, listManagerAgents, type ManagerCandidate } from "../service";

/**
 * Put an AI Matrx agent in a room as its manager: pick one of the person's
 * agents (or a published one) that carries the agent_messages tool, give it a
 * goal; its first turn reads the room and starts on the goal.
 */
export function AddManagerDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  onAdded: () => void;
}) {
  const [agents, setAgents] = useState<ManagerCandidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listManagerAgents()
      .then((list) => {
        if (!current) return;
        setAgents(list);
        if (list.length === 1) setPicked(list[0].agentId);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "The agent list did not load.");
      });
    return () => {
      current = false;
    };
  }, []);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await addAgentToRoom(roomId, picked, goal);
      onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent was not added.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a manager agent to {roomName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1" role="listbox" aria-label="Manager agents">
          {agents === null && !error ? (
            <div className="h-9 animate-pulse rounded bg-muted/60" />
          ) : agents && agents.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              None of your agents can message a room yet. An agent needs the agent messages tool.
            </p>
          ) : (
            (agents ?? []).map((a) => (
              <button
                key={a.agentId}
                type="button"
                role="option"
                aria-selected={picked === a.agentId}
                onClick={() => setPicked(a.agentId)}
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/50",
                  picked === a.agentId && "bg-accent",
                )}
              >
                <AGENT_ICON className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{a.name}</span>
                  {a.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{a.description}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Goal, e.g. ask each session whether it is blocked and tell me"
          aria-label="Goal for the agent"
          rows={3}
          maxLength={4000}
        />
        {error && <ErrorNotice message={error} size="inline" />}
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !picked} onClick={() => void submit()}>
            Add agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
