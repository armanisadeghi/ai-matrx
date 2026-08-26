// features/agents/mandates/components/MandateDoorLink.tsx
//
// THE DOOR to /agents/mandates for ONE feature domain.
//
// The platform's headline capability — swap the intelligence behind any step,
// with no deploy — is worthless if the feature it powers gives its users no way
// in. Every feature that owns mandates owns a door, and the door is ALWAYS
// deep-linked: unfiltered, /agents/mandates is 331 mandates across 47 domains,
// which is a scroll, not a door.
//
// `feature` is the mandate key's first segment (`splitMandateKey().feature` —
// e.g. "crm" for `crm.contact_saver`). Since the 2026-08-26 rework the door
// lands as a REAL select facet on the canonical list (`?filters=` via
// mandatesBrowseHref) — strict, not the old neighbour-surfacing substring
// search; the legacy `?feature=` form still normalizes server-side.
//
// Icon is BrainCircuit, always — Sparkles is banned for AI (CLAUDE.md).
// Law: ../../../../../common-docs/policies/no-dead-ends.md
// Contract + the list of live doors: features/agents/mandates/FEATURE.md.

import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { mandatesBrowseHref } from "../browse/url-compat";

interface MandateDoorLinkProps {
  /** Mandate-key domain, e.g. "crm", "masterwork", "workflow". */
  feature: string;
  /**
   * Accessible name AND tooltip — say whose agents these are ("CRM agents"),
   * never a bare "Agents", so the door reads as this feature's door.
   */
  label: string;
  /** `icon` (default) is a 28px icon button for a route header; `inline` is a text link for a body action row. */
  variant?: "icon" | "inline";
  className?: string;
}

export function MandateDoorLink({
  feature,
  label,
  variant = "icon",
  className,
}: MandateDoorLinkProps) {
  const href = mandatesBrowseHref(feature);

  if (variant === "inline") {
    return (
      <Link
        href={href}
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
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <BrainCircuit className="h-4 w-4" />
    </Link>
  );
}
