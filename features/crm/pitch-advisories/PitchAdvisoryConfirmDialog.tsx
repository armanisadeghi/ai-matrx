"use client";

// features/crm/pitch-advisories/PitchAdvisoryConfirmDialog.tsx
//
// For an action that has no screen of its own to show warnings on (activating a
// campaign from a list row): the same <PitchAdvisoryPanel>, above the same
// action, in a plain dialog. The confirm button is ALWAYS live — the warnings
// inform, they never gate (validation-offers-never-blocks).

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PitchAdvisoryPanel } from "./PitchAdvisoryPanel";
import type { PitchAdvisoryRequest } from "./service";
import { usePitchAdvisories } from "./usePitchAdvisories";

export function PitchAdvisoryConfirmDialog({
  open,
  onOpenChange,
  organizationId,
  request,
  title,
  description,
  confirmLabel,
  entityType,
  entityId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  request: PitchAdvisoryRequest;
  title: string;
  description: string;
  confirmLabel: string;
  entityType: string;
  entityId: string;
  onConfirm: () => Promise<void>;
}) {
  const advisories = usePitchAdvisories(organizationId, open ? request : null);
  const [running, setRunning] = useState(false);

  async function confirmNow() {
    setRunning(true);
    try {
      await advisories.recordGoAhead({ entityType, entityId });
      await onConfirm();
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  }

  const clean =
    !advisories.loading && !advisories.error && (advisories.report?.advisories ?? []).length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PitchAdvisoryPanel
          state={advisories}
          organizationId={organizationId}
          actionLabel={confirmLabel.toLowerCase()}
          surfaceName="crm-outreach-lists"
        />
        {clean && advisories.report && (
          <p className="text-sm text-muted-foreground">
            Nothing to flag against your PR settings.
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={() => void confirmNow()} disabled={running}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
