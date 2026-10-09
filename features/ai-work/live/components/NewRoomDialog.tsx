"use client";

import { ErrorNotice } from "@ai-matrx/design-system";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import type { LiveSession } from "../useLiveHub";
import { addSessionToRoom, createRoom } from "../service";
import { PresenceDot } from "./LiveBits";

export function NewRoomDialog({
  open,
  onOpenChange,
  sessions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: readonly LiveSession[];
  onCreated: (roomId: string) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = sessions.filter((s) => s.presence !== "ended");

  const toggle = (address: string) =>
    setPicked((cur) => (cur.includes(address) ? cur.filter((a) => a !== address) : [...cur, address]));

  const submit = async () => {
    const [first, ...rest] = picked;
    if (!name.trim() || !first) return;
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await createRoom(name.trim(), first);
      for (const address of rest) await addSessionToRoom(roomId, address);
      setName("");
      setPicked([]);
      onCreated(roomId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room was not created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New room</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Room name"
          aria-label="Room name"
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
          {choices.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No active sessions to add.</p>
          ) : (
            choices.map((s) => (
              <label
                key={s.address}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50"
              >
                <Checkbox
                  checked={picked.includes(s.address)}
                  onCheckedChange={() => toggle(s.address)}
                />
                <PresenceDot presence={s.presence} />
                <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{s.providerLabel}</span>
              </label>
            ))
          )}
        </div>
        {error && <ErrorNotice message={error} size="inline" />}
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || picked.length === 0} onClick={() => void submit()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
