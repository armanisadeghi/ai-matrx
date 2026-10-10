"use client";

/**
 * "Take me there" — the button that opens the guided-capture dialog. One
 * component for every place a page "couldn't be read" (account header, track
 * dialog refusal, accounts row…): pass what is known about the account.
 */

import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { GuidedCaptureDialog } from "./GuidedCaptureDialog";
import type { GuidedCaptureTarget } from "./guidedApi";

export function GuidedCaptureButton({
  organizationId,
  target,
  platformLabel,
  onCaptured,
  label = "Take me there",
}: {
  organizationId: string;
  target: GuidedCaptureTarget;
  platformLabel?: string;
  onCaptured?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="shrink-0" variant="outline" icon={<MonitorSmartphone />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <GuidedCaptureDialog
        open={open}
        onOpenChange={setOpen}
        organizationId={organizationId}
        target={target}
        {...(platformLabel ? { platformLabel } : {})}
        {...(onCaptured ? { onCaptured } : {})}
      />
    </>
  );
}
