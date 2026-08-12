"use client";

// features/canvas/maps/NewMapDialog.tsx
//
// Creating a map must not require knowing what a "node" or an "edge" is. Two
// fields: what to call it, and — optionally — the steps written the way the
// person would say them out loud, one per line. Everything else is dragging.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMap } from "./service";
import { draftMapFromLines, mapHref, starterMap } from "./types";

const EXAMPLE = `Patient calls
Front desk takes details
Nurse reviews
Doctor sees patient
Follow-up booked`;

export function NewMapDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setSteps("");
    setBusy(false);
  };

  const submit = async () => {
    const title = name.trim();
    if (!title) return;
    setBusy(true);
    const diagram = steps.trim()
      ? draftMapFromLines(title, steps)
      : starterMap(title);
    const { id, isDuplicate, error } = await createMap(title, diagram);
    setBusy(false);

    if (error || !id) {
      toast.error(error ?? "Could not create that map.");
      return;
    }
    if (isDuplicate) {
      // Loud, not silent: the user asked for a new map and is getting an
      // existing one, and they need to know which.
      toast.info("You already have a map exactly like this — opening it.");
    }
    onOpenChange(false);
    reset();
    onCreated?.();
    router.push(mapHref({ id }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New map</DialogTitle>
          <DialogDescription>
            A map is a picture of how something works — steps, people or parts,
            with arrows between them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="map-name">What is this map about?</Label>
            <Input
              id="map-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How a new patient gets seen"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !busy) void submit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-steps">
              Want a head start? List the steps, one per line
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="map-steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={6}
              placeholder={EXAMPLE}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll turn each line into a box and join them up in order. You
              can move, rename, add and remove anything afterwards.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Creating…" : "Create map"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
