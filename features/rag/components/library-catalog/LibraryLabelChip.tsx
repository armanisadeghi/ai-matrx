"use client";

/**
 * WHAT A LIBRARY RESOURCE IS — the two-axis label, in one chip pair.
 *
 * Arman, 2026-08-23: *"imagine news you get from CNN versus the news you get
 * from the associated press versus a blog article versus Wikipedia versus
 * social media … the same needs to apply to us."*
 *
 * The two axes are deliberately NOT one score, and the UI must not merge them:
 *   • **Source** — how authoritative the ORIGIN is. Nothing to do with us.
 *   • **Assurance** — what WE did to it, and therefore what we stand behind.
 * "The AMA guide, reproduced as-is" and "our own expert wrote this" are both
 * high trust for opposite reasons; one badge cannot say both.
 *
 * Tiers are ROWS (`platform.source_authority` / `platform.assurance_level`),
 * so this component never hardcodes the list — it renders whatever label the
 * catalog handed it. Only the TONE is a local decision, and it is keyed on the
 * few slugs that carry a warning, defaulting to neutral for anything new.
 */

import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

/** Tone for the assurance half. Neutral is the default for any unknown slug —
 *  a new tier must never render as if it were verified. */
const ASSURANCE_TONE: Record<string, string> = {
  expert_reviewed: "border-success/40 bg-success/10 text-success",
  ai_fact_checked: "border-success/30 bg-success/5 text-success",
  verbatim: "border-primary/30 bg-primary/5 text-primary",
  ai_reviewed: "border-border bg-muted text-muted-foreground",
  unverified: "border-warning/40 bg-warning/10 text-warning",
};

function assuranceIcon(slug: string | null) {
  if (slug === "expert_reviewed" || slug === "ai_fact_checked") return ShieldCheck;
  if (slug === "unverified") return ShieldAlert;
  return ShieldQuestion;
}

export function LibraryLabelChip({
  sourceAuthority,
  sourceAuthorityLabel,
  assuranceLevel,
  assuranceLevelLabel,
  assuranceLevelBlurb,
  className,
}: {
  sourceAuthority: string | null;
  sourceAuthorityLabel: string | null;
  assuranceLevel: string | null;
  assuranceLevelLabel: string | null;
  assuranceLevelBlurb?: string | null;
  className?: string;
}) {
  // A type that carries no labels (data stores, packs — not yet) renders
  // nothing rather than an empty or guessed badge.
  if (!sourceAuthorityLabel && !assuranceLevelLabel) return null;

  const Icon = assuranceIcon(assuranceLevel);
  const tone =
    (assuranceLevel && ASSURANCE_TONE[assuranceLevel]) ??
    "border-border bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {sourceAuthorityLabel ? (
        <span
          className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={`Source: ${sourceAuthorityLabel} — where this came from, before we touched it.`}
        >
          {sourceAuthorityLabel}
        </span>
      ) : null}
      {assuranceLevelLabel ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            tone,
          )}
          title={
            assuranceLevelBlurb ??
            `${assuranceLevelLabel} — what Matrx did to it.`
          }
        >
          <Icon className="h-3 w-3" aria-hidden />
          {assuranceLevelLabel}
        </span>
      ) : null}
    </span>
  );
}
