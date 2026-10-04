"use client";

/**
 * Feedback: the four-layer toast (fired for real and shown in place) and
 * dialogs at the default md width. A dialog portals out of the page, so its
 * body carries its own 28px scope.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { MeasuredBare } from "../../_components/one-control";
import {
  ALL_LAYERS,
  PEEK_CLASS,
  SAMPLE_DETAIL,
  SmartToastCard,
  TOAST_LONG_SAMPLE,
  ToastDetailBody,
  ToastWindowHost,
  smartToast,
} from "../../_components/toast-system";
import { Group, Section } from "./kit";
import { Button, ControlRow, ControlScope, Field } from "@ai-matrx/design-system/controls";

const FIRE: ReadonlyArray<{ label: string; run: () => void }> = [
  { label: "Success", run: () => smartToast.success("Note saved") },
  { label: "Error", run: () => smartToast.error("Couldn't save the note") },
  { label: "All layers", run: () => smartToast.success("Note saved", ALL_LAYERS) },
  { label: "Long message", run: () => smartToast.error(TOAST_LONG_SAMPLE, { href: "/notes" }) },
];

function RenameDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ControlScope>
          <DialogHeader>
            <DialogTitle className="text-base">Rename form</DialogTitle>
            <DialogDescription className="text-xs">Everyone with access sees the new name.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Field style={{ width: "calc(100% - var(--matrx-control-gap))" }} defaultValue="Intake form — dental" aria-label="Form name" />
          </div>
          <DialogFooter>
            <ControlRow className="justify-end">
              <Button variant="quiet" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => onOpenChange(false)}>
                Rename
              </Button>
            </ControlRow>
          </DialogFooter>
        </ControlScope>
      </DialogContent>
    </Dialog>
  );
}

export function Feedback() {
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const noop = () => {};
  return (
    <Section id="feedback" title="Feedback">
      <Group label="Toast · fire one">
        <MeasuredBare>
          {FIRE.map((f) => (
            <Button variant="outline" key={f.label} onClick={f.run}>
              {f.label}
            </Button>
          ))}
        </MeasuredBare>
      </Group>

      <div className="grid gap-6 lg:grid-cols-2">
        <Group label="1 · Message, copy for AI, close">
          <div className="flex flex-col gap-1.5">
            <SmartToastCard kind="success" message="Note saved" onClose={noop} />
            <SmartToastCard kind="warning" message="2 fields were left blank" onClose={noop} />
            <SmartToastCard kind="error" message="Couldn't save the note" onClose={noop} />
          </div>
        </Group>
        <Group label="2–4 · Peek, window, new tab">
          <div className="flex flex-col gap-1.5">
            <SmartToastCard kind="success" message="Note saved" options={ALL_LAYERS} onClose={noop} />
            <div className={cn("max-w-full rounded-md", PEEK_CLASS)}>
              <ToastDetailBody kind="success" message="Note saved" detail={SAMPLE_DETAIL} />
            </div>
          </div>
        </Group>
        <Group label="Narrow · 240px folds layers into More">
          <div className="flex flex-col gap-1.5">
            <SmartToastCard kind="success" message="Note saved" options={ALL_LAYERS} onClose={noop} className="w-[240px]" />
            <SmartToastCard kind="error" message={TOAST_LONG_SAMPLE} options={{ href: "/notes" }} onClose={noop} className="w-[240px]" />
          </div>
        </Group>
        <Group label="Dialogs · md width">
          <MeasuredBare>
            <Button variant="outline" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Delete form
            </Button>
          </MeasuredBare>
        </Group>
      </div>

      <RenameDialog open={renameOpen} onOpenChange={setRenameOpen} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete “Intake form — dental”?"
        description="Removes 2,140 responses for 3 people. This can't be undone."
        confirmLabel="Delete form"
        variant="destructive"
        contentClassName="sm:max-w-md"
        onConfirm={() => setConfirmOpen(false)}
      />
      <ToastWindowHost />
    </Section>
  );
}
