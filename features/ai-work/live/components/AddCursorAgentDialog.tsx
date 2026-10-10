"use client";

import { ErrorNotice } from "@ai-matrx/design-system";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  addCursorAgentToRoom,
  cursorErrorMessage,
  listCursorAgents,
  type CursorAgentChoice,
} from "@/features/ai-work/lib/cursorAccounts";

/**
 * Put a Cursor cloud agent in a room: pick one of the agents the person's
 * connected Cursor keys list. From then on the server delivers the room's mail
 * to it as a follow-up message (aidream `cursor_cloud.py`).
 */
export function AddCursorAgentDialog({
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
  const [agents, setAgents] = useState<CursorAgentChoice[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [picked, setPicked] = useState<CursorAgentChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listCursorAgents()
      .then((out) => {
        if (!current) return;
        setAgents(out.agents);
        setProblems(out.problems.map((p) => `${p.account}: ${p.detail}`));
        if (out.agents.length === 1) setPicked(out.agents[0]);
      })
      .catch((cause: unknown) => {
        if (current) setError(cursorErrorMessage(cause, "Your Cursor agents did not load."));
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
      await addCursorAgentToRoom(roomId, picked);
      onAdded();
    } catch (cause) {
      setError(cursorErrorMessage(cause, "The Cursor agent was not added."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a Cursor agent to {roomName}</DialogTitle>
        </DialogHeader>
        <div
          className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1"
          role="listbox"
          aria-label="Cursor cloud agents"
        >
          {agents === null && !error ? (
            <div className="h-9 animate-pulse rounded bg-muted/60" />
          ) : agents && agents.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              No Cursor cloud agents found.{" "}
              <Link href="/work/connections#cursor-accounts" className="underline">
                Connect a Cursor account
              </Link>
            </p>
          ) : (
            (agents ?? []).map((a) => (
              <button
                key={a.agentId}
                type="button"
                role="option"
                aria-selected={picked?.agentId === a.agentId}
                onClick={() => setPicked(a)}
                className={cn(
                  "flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-accent/50",
                  picked?.agentId === a.agentId && "bg-accent",
                )}
              >
                <span className="block truncate text-sm">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.status} · {a.account}
                </span>
              </button>
            ))
          )}
        </div>
        {problems.map((p) => (
          <ErrorNotice key={p} message={p} size="inline" />
        ))}
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
