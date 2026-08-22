"use client";

/**
 * The UNBOUND state of a scraper analysis tab — rendered when the tab's mandate
 * cannot resolve (not seeded yet, no Holder bound, disabled). Says plainly what
 * is missing, and carries the two ways out: the reusable mandate picker (bind
 * an agent right here) and the door to /agents/mandates filtered to scraper.
 * The tab never silently runs a hardcoded agent id.
 */

import { BrainCircuit } from "lucide-react";
import { Card } from "@/components/official/PageTemplate";
import { MandateAgentPicker } from "@/features/agents/mandates/components/MandateAgentPicker";
import { MandateDoorLink } from "@/features/agents/mandates/components/MandateDoorLink";

export function AnalysisMandateGate({
  mandateKey,
  title,
  error,
}: {
  mandateKey: string;
  /** What this tab does — "Fact Checker", "Keyword Analysis". */
  title: string;
  /** The resolver's message, shown verbatim. */
  error: string;
}) {
  return (
    <Card title={`${title} — no agent assigned`}>
      <div className="flex flex-col gap-3 p-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
          <span>
            {title} runs through the{" "}
            <code className="text-xs">{mandateKey}</code> mandate, which has no
            agent bound yet. Bind one to turn this tab on.
          </span>
        </p>
        <p className="text-xs text-destructive">{error}</p>
        <div className="flex flex-wrap items-center gap-2">
          <MandateAgentPicker mandateKey={mandateKey} />
          <MandateDoorLink
            feature="scraper"
            label="Scraper agents"
            variant="inline"
          />
        </div>
      </div>
    </Card>
  );
}
