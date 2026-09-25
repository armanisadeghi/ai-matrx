// features/mandates/components/MandateDoorLink.tsx
//
// THE DOOR to one feature's intelligence.
//
// Every feature that owns mandates owns a door, and since 2026-09-25 the door
// lands on the feature's INTELLIGENCE page (`/intelligence/<feature>`,
// features/mandates/feature-intelligence) — what runs each job for the viewer,
// where it runs, Duplicate & modify or Use my own — instead of the mandate
// list filtered to a domain (UI-REGISTER "Feature intelligence pages": people
// manage jobs from inside the app, they rarely browse hundreds of mandates).
//
// `icon` (default) is the Intelligence icon itself — the same mark every
// intelligence door wears, with its popover of the feature's jobs. `inline` is
// a text link for a body action row. Icon is BrainCircuit, always — Sparkles
// is banned for AI (CLAUDE.md).
// Law: ../../../../../common-docs/policies/no-dead-ends.md
// Contract: features/mandates/feature-intelligence/FEATURE.md.

import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { featureIntelligenceHref } from "../feature-intelligence/hrefs";
import { IntelligenceIndicator } from "../feature-intelligence/IntelligenceIndicator";
import type { IntelligenceContext } from "../feature-intelligence/types";

interface MandateDoorLinkProps {
  /** Mandate-key domain, e.g. "crm", "masterwork", "workflow". */
  feature: string;
  /**
   * Whose jobs these are ("CRM agents") — the inline link's text and the
   * icon popover's subtitle.
   */
  label: string;
  /** `icon` (default) for a route header; `inline` is a text link for a body action row. */
  variant?: "icon" | "inline";
  /** Values the intelligence page's place links need (`rulebookId`, `topicId`, …). */
  context?: IntelligenceContext;
  className?: string;
}

export function MandateDoorLink({
  feature,
  label,
  variant = "icon",
  context,
  className,
}: MandateDoorLinkProps) {
  if (variant === "inline") {
    return (
      <Link
        href={featureIntelligenceHref(feature, { context })}
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <BrainCircuit className="h-3.5 w-3.5" />
        {label}
      </Link>
    );
  }

  return (
    <IntelligenceIndicator
      feature={feature}
      label={label}
      context={context}
      size="md"
      className={className}
    />
  );
}
