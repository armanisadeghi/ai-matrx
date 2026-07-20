"use client";

import { useState, useTransition } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { suggestEditAction } from "../actions";

/**
 * Suggest-edit — the ethical contribution flywheel. A studier proposes an
 * improvement to a community deck; it routes to the owner's inbox (never edits
 * their deck directly). Integrity-positive: improvements, not answers.
 */
export function SuggestEditDialog({
  deckId,
  deckName,
}: {
  deckId: string;
  deckName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!body.trim()) {
      toast.error("Write a suggestion first.");
      return;
    }
    startTransition(async () => {
      try {
        await suggestEditAction(deckId, body.trim());
        toast.success("Sent to the deck owner");
        setBody("");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" /> Suggest edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest an improvement</DialogTitle>
          <DialogDescription>
            Propose a fix or addition to “{deckName}”. It goes to the owner to
            accept or decline — it never changes their deck directly.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="e.g. Card 12's answer should mention the Calvin cycle runs in the stroma."
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
