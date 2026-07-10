"use client";

// features/education/tutor/components/TutorTrustStrip.tsx
//
// The tutor's visible P0 trust surface. The live tutor is a streaming markdown
// agent, so it can't (yet) carry a per-claim structured envelope on every turn
// the way item-shaped agents (fc_help_live) do. This strip is the honest
// companion the P0 mandate requires on the conversation: it shows WHAT the
// tutor is grounded in (real citations from `grounding.ts` — the seed item +
// the learner's weak cards), an honest confidence floor (`inferred`, never a
// fabricated `grounded`), and — when nothing is loaded — the refusal
// convention: answers draw on general knowledge and the tutor says so.
//
// The envelope is DERIVED from known sources, not invented. Per-answer inline
// citation + honest refusal are still enforced by the agent prompt; this makes
// the grounding legible instead of implicit. Target state (once the streaming
// channel can carry structure) is a per-turn envelope — see FEATURE.md.

import { useState } from "react";
import { ShieldCheck, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import type { TrustEnvelope } from "@/features/education/trust/types";

export function TutorTrustStrip({ trust }: { trust: TrustEnvelope | null }) {
  const [open, setOpen] = useState(false);
  if (!trust) return null;

  const hasSources = trust.citations.length > 0;

  // No corpus loaded — the honest "this is general knowledge" convention.
  if (!hasSources || trust.confidence === "not_in_material") {
    return (
      <div className="flex items-center gap-1.5 border-b border-border bg-amber-500/5 px-4 py-1.5 text-xs text-muted-foreground">
        <ConfidenceBadge confidence="not_in_material" iconOnly />
        <span>
          No study material loaded yet — the tutor answers from general knowledge
          and will tell you when something isn&apos;t from your material.
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-card/40 px-4 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground"
        aria-expanded={open}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="font-medium text-foreground">
          Grounded in {trust.groundedIn ?? "your material"}
        </span>
        <ConfidenceBadge confidence={trust.confidence} className="ml-0.5" />
        <span className="ml-auto flex items-center gap-1">
          {trust.citations.length} source
          {trust.citations.length === 1 ? "" : "s"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open && (
        <div className="pt-2">
          <SourceCitations trust={trust} label={null} />
          <p className="pt-1.5 text-[11px] text-muted-foreground">
            The tutor cites your material inline and refuses questions outside it
            rather than guessing.
          </p>
        </div>
      )}
    </div>
  );
}
