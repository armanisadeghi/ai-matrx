"use client";

// features/mandates/unassigned/UnassignedMandateCard.tsx
//
// THE ANSWER TO "NOBODY IS ASSIGNED TO THIS JOB YET".
//
// Arman, 2026-10-04: the refusal paragraph ("…An administrator assigns one in
// Administration → Mandates…") is a dead end. Wherever a feature hits a job
// with no Holder, it shows THIS instead: one line saying what is missing and
// two buttons — create an agent for the job (the Mandate window's New agent
// tab, which drafts an agent from the job's goal and offered values) or pick
// one that already exists (the Binding tab). The person never leaves the page.
//
// Feed it the key from `readUnassignedMandate(error)`; render the old error
// text only when that returns null.

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { useOpenMandateWindowNext } from "@/features/overlays/openers/mandateWindowNext";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { cn } from "@/lib/utils";

export interface UnassignedMandateCardProps {
  /** The job nobody holds — from `readUnassignedMandate`. */
  mandateKey: string;
  /** The server's one-line sentence ("Nobody is assigned to write agenda drafts yet."). */
  sentence?: string | null;
  className?: string;
}

export function UnassignedMandateCard({
  mandateKey,
  sentence,
  className,
}: UnassignedMandateCardProps) {
  const openMandate = useOpenMandateWindowNext();
  const open = (initialTab: "create-agent" | "holder") =>
    openMandate({ initialMandateKey: mandateKey as AnyMandateKey, initialTab });

  return (
    <div
      role="status"
      data-testid="unassigned-mandate-card"
      data-mandate-key={mandateKey}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs",
        className,
      )}
    >
      <span className="min-w-0 flex-1 text-foreground">
        {sentence?.trim() || "No agent does this job yet."}
      </span>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => open("create-agent")}
        >
          <AGENT_ICON className="h-3.5 w-3.5" aria-hidden="true" />
          Create agent
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => open("holder")}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Use existing
        </Button>
      </div>
    </div>
  );
}
