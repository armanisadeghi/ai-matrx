"use client";

// features/mandates/authoring/AutomationButton.tsx
//
// An affordance that runs a MANDATE BY KEY — mandates all the way down. While
// the key resolves to nothing it renders honestly disabled, naming the exact
// key to create; the moment that mandate exists (Arman creates it, no deploy)
// the button lights up. Never a hardcoded agent id, never a silent no-op.

import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMandate } from "../useMandate";

export function AutomationButton({
  mandateKey,
  label,
  runningLabel,
  running,
  onRun,
}: {
  mandateKey: string;
  /** Tight copy — two or three words ("Refine with AI"). */
  label: string;
  runningLabel: string;
  running: boolean;
  onRun: () => void;
}) {
  // optional: an absent automation mandate is the expected starting state —
  // the button says so; it is not a console error.
  const { mandate, loading } = useMandate(mandateKey, { optional: true });
  const available = mandate !== null;

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-[12px]"
      disabled={!available || running || loading}
      onClick={available ? onRun : undefined}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BrainCircuit className="h-3.5 w-3.5" />
      )}
      {running ? runningLabel : label}
    </Button>
  );

  if (available || loading) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        No mandate bound yet — create{" "}
        <code className="font-mono">{mandateKey}</code>
      </TooltipContent>
    </Tooltip>
  );
}
