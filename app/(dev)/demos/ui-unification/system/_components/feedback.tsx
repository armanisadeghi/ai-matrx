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
import { MeasuredBare, Scale } from "../../_components/one-control";
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
        <Scale scale={28} pad="matched">
          <DialogHeader>
            <DialogTitle className="text-base">Rename form</DialogTitle>
            <DialogDescription className="text-xs">Everyone with access sees the new name.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label className="uc-field" style={{ width: "calc(100% - var(--matrx-tap-gap))" }}>
              <input defaultValue="Intake form — dental" aria-label="Form name" />
            </label>
          </div>
          <DialogFooter>
            <div className="uc-row justify-end">
              <button type="button" className="uc-btn uc-btn-quiet" onClick={() => onOpenChange(false)}>
                Cancel
              </button>
              <button type="button" className="uc-btn uc-btn-primary" onClick={() => onOpenChange(false)}>
                Rename
              </button>
            </div>
          </DialogFooter>
        </Scale>
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
            <button key={f.label} type="button" className="uc-btn uc-btn-outline" onClick={f.run}>
              {f.label}
            </button>
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
            <button type="button" className="uc-btn uc-btn-outline" onClick={() => setRenameOpen(true)}>
              Rename
            </button>
            <button type="button" className="uc-btn uc-btn-danger" onClick={() => setConfirmOpen(true)}>
              Delete form
            </button>
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
