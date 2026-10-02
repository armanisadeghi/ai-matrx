"use client";

// features/mandates/candidate-dialog/TryAsCandidateButton.tsx
//
// The one button every "try before you advance" door renders (P18 + §2.6):
// "Try as candidate" beside Advance on a graded impact row, "Set as live
// candidate" on a bench result. It owns nothing but the open state; the
// dialog is the one SetCandidateDialog.

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { SetCandidateDialog } from "./SetCandidateDialog";
import type { LiveCandidate } from "./api";
import type { CandidateRungChoice } from "./target";

export function TryAsCandidateButton({
  mandateKey,
  mandateName,
  target,
  rung,
  label = "Try as candidate",
  title = "Run it beside the live one on the next real runs, then decide.",
  disabled = false,
  className,
  onSet,
}: {
  mandateKey: AnyMandateKey;
  mandateName: string;
  target: HolderDraft | null;
  rung: CandidateRungChoice;
  label?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  onSet?: (candidate: LiveCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-testid="try-as-candidate"
        className={cn("h-7 gap-1 px-2 text-xs", className)}
        disabled={disabled}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <FlaskConical className="h-3 w-3" />
        {label}
      </Button>
      {open ? (
        <SetCandidateDialog
          mandateKey={mandateKey}
          mandateName={mandateName}
          initialTarget={target}
          rung={rung}
          onClose={() => setOpen(false)}
          onSet={onSet}
        />
      ) : null}
    </>
  );
}
