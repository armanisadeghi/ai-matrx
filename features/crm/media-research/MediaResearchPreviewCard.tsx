"use client";

// features/crm/media-research/MediaResearchPreviewCard.tsx
//
// What the person sees BEFORE anything is spent: the multiplier and why, the
// exact research brief, the resulting target, and the maximum cost. Over the
// cap, the strong warning renders through THE ONE pitch-advisory panel with its
// one-click smaller options — and "Run it" stays live: the person may confirm
// and the run goes ahead as asked (validation offers, never blocks).

import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PitchAdvisoryPanel } from "@/features/crm/pitch-advisories/PitchAdvisoryPanel";
import type { AdvisoryOffer, PitchAdvisory } from "@/features/crm/pitch-advisories/service";
import type { MediaResearchPreview } from "./service";
import { formatCount } from "@ai-matrx/kit/format";
import { useCostDisplay } from "@/components/cost/useCostDisplay";

export interface MediaResearchPreviewCardProps {
  preview: MediaResearchPreview;
  running?: boolean;
  onRun: () => void;
  /** "Run at the cap" / "Split by beat" — performed by the host. */
  onOffer?: (offer: AdvisoryOffer) => void;
}

function canPerform(offer: AdvisoryOffer): boolean {
  if (offer.action === "limit_to") return typeof offer.detail?.count === "number";
  if (offer.action === "split_angles") return true;
  return false;
}

export function MediaResearchPreviewCard({
  preview,
  running = false,
  onRun,
  onOffer,
}: MediaResearchPreviewCardProps) {
  const advisories: PitchAdvisory[] = preview.advisories ?? [];
  // Everyone sees points; a system admin who flipped the switch sees dollars.
  const { format: formatCost } = useCostDisplay();
  const maxCost = formatCost(preview.cost.max_cost_usd);
  return (
    <section
      aria-label="Research preview"
      data-testid="media-research-preview"
      className="space-y-3 rounded-md border border-border bg-card p-3 text-sm"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Good fits wanted" value={String(preview.wanted_good_fits)} />
        <Stat label="Multiplier" value={`${preview.multiplier}x`} testId="media-research-multiplier" />
        <Stat
          label="Research target"
          value={String(preview.research_target)}
          testId="media-research-target"
          tone={preview.over_cap ? "strong" : undefined}
        />
        <Stat
          label="Maximum cost"
          value={maxCost}
          testId="media-research-max-cost"
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="media-research-multiplier-reason">
        {preview.multiplier_reason}
      </p>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h4 className="text-xs font-semibold text-foreground">The research brief</h4>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatCount(preview.brief_chars)} / {formatCount(preview.brief_max_chars)} characters
          </span>
        </div>
        <pre
          data-testid="media-research-brief"
          className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-sans text-xs text-foreground"
        >
          {preview.brief}
        </pre>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          What the maximum cost covers ({preview.queries.length} searches)
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {(preview.cost.lines ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-1">Searches: {preview.queries.join(" · ")}</p>
      </details>

      <PitchAdvisoryPanel
        state={{ report: { surface: "list_save", advisories, action_may_proceed: true, wants_person: false }, loading: false, error: null, retry: () => {} }}
        onLocalOffer={(_advisory, offer) => {
          onOffer?.(offer);
          return true;
        }}
        canPerformLocal={(offer) => Boolean(onOffer) && canPerform(offer)}
        actionLabel="Run it"
      />

      {preview.prior_run ? (
        <p className="text-xs text-muted-foreground" data-testid="media-research-prior-run">
          {preview.says}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Nothing is spent until you press Run it. Up to {maxCost}.
        </p>
        <Button
          icon={running ? <Loader2 className="animate-spin" /> : <Play />}
          variant="primary"
          type="button"
          disabled={running}
          onClick={onRun}
          data-testid="media-research-run"
        >
          {preview.prior_run ? "Show that answer" : preview.over_cap ? `Run it at ${preview.research_target} anyway` : "Run it"}
        </Button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId?: string;
  tone?: "strong";
}) {
  return (
    <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        data-testid={testId}
        className={tone === "strong" ? "text-base font-semibold tabular-nums text-destructive" : "text-base font-semibold tabular-nums text-foreground"}
      >
        {value}
      </div>
    </div>
  );
}
