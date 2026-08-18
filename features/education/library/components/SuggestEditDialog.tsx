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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
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

  const trigger = (
    <Button variant="ghost" size="sm" className="gap-1.5">
      <Lightbulb className="h-3.5 w-3.5" /> Suggest edit
    </Button>
  );

  const field = (
    <Textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      rows={5}
      placeholder="e.g. Card 12's answer should mention the Calvin cycle runs in the stroma."
      autoFocus
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle>Suggest an improvement</DrawerTitle>
            <DrawerDescription>
              Propose a fix or addition to “{deckName}”. It goes to the owner to
              accept or decline — it never changes their deck directly.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{field}</div>
          <DrawerFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending} className="flex-1 gap-1.5">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send suggestion
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest an improvement</DialogTitle>
          <DialogDescription>
            Propose a fix or addition to “{deckName}”. It goes to the owner to
            accept or decline — it never changes their deck directly.
          </DialogDescription>
        </DialogHeader>
        {field}
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
