"use client";

// features/vision-interview/components/NewInterviewDialog.tsx
//
// "New interview": title + the opening vision statement. Creates the
// interview.session row direct via Supabase (plain DB write — never through
// Python) and routes into the room, where Start launches the workflow run.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { createSession } from "../service";

interface NewInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewInterviewDialog({
  open,
  onOpenChange,
}: NewInterviewDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [vision, setVision] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const session = await createSession({
        title,
        visionStatement: vision,
      });
      onOpenChange(false);
      setTitle("");
      setVision("");
      startTransition(() => {
        router.push(`/vision-interview/${session.id}`);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the interview.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title="New vision interview"
      description="Give the room your vision in your own words — the six roles take it from there."
      content={
        <div className="space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Interview title"
            className="text-base sm:text-sm"
          />
          <Textarea
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="What's the vision? A paragraph is plenty — say it the way you'd say it out loud."
            aria-label="Vision statement"
            rows={5}
            className="text-base sm:text-sm"
          />
        </div>
      }
      confirmLabel="Create"
      confirmDisabled={!vision.trim()}
      busy={busy}
      onConfirm={() => void create()}
    />
  );
}

/** The list page's New button + its dialog, as one drop-in. */
export function NewInterviewButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className="h-11 lg:h-7" onClick={() => setOpen(true)}>
        New
      </Button>
      <NewInterviewDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
