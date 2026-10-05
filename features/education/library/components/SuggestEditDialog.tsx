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
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Button } from "@/components/ui/button";
import { suggestDeckEdit } from "../service";
import { ProTextarea } from "@/components/official/ProTextarea";
import { guardedSave } from "@/lib/save/guardedSave";

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
        // A new suggestion is not safe to repeat: no Retry, only the honest wait.
        await guardedSave(() => suggestDeckEdit(deckId, body.trim()), {
          what: "your suggestion",
        });
        toast.success("Sent to the deck owner");
        setBody("");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const trigger = (
    <Button icon={<Lightbulb />} type="submit" variant="quiet"> Suggest edit
    </Button>
  );

  const field = (
    <ProTextarea
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
            <Button
              icon={isPending ? <Loader2 className="animate-spin" /> : null}
              variant="primary"
              onClick={submit}
              disabled={isPending}
              className="flex-1"
            >
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
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button icon={isPending ? <Loader2 className="animate-spin" /> : null} variant="primary" onClick={submit} disabled={isPending}>
            Send suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
