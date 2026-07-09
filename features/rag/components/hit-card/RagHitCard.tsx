"use client";

/**
 * RagHitCard — the ONE canonical card for a retrieved RAG hit, used by every
 * surface (the `rag_search` tool card, `/rag/search`, the files omnibox, chat
 * citations). Two variants share one beautiful core:
 *
 *   - "compact"  — a mini entity-card ROW (glossy glyph · 2-line title · color
 *                  score · open) whose full chunk + rank breakdown + entities +
 *                  actions live in a hover peek. For chat + omnibox.
 *   - "expanded" — the same header, then the full chunk inline, then the
 *                  breakdown always-visible (+ chunk_id copy). For the search
 *                  lab, where power users want everything on screen.
 *
 * Both draw the same glyph (kindGlyph), the same color-coded score (scoreTier),
 * and the same breakdown — so the two never drift. Callers adapt their hit type
 * to `RagHitView` and pass `href` (deep-link) + `onOpen` (window).
 */

import { ExternalLink, PanelRight, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ToolAccent } from "@/features/tool-call-visualization/types";
import { ToolGlyph } from "@/features/tool-call-visualization/renderers/_shared-entity/ToolGlyph";
import { PartPeekPopover } from "@/features/tool-call-visualization/renderers/_shared-entity/PartPeekPopover";
import { scoreTier, relativeStrength, type RelevanceTier } from "./scoreTier";
import { kindGlyph } from "./kindGlyph";
import { type RagHitView, isEntityOnly } from "./types";

/** A subtle per-kind wash for the compact popover header strip. */
const HEADER_WASH: Record<ToolAccent, string> = {
  primary: "bg-primary/10",
  blue: "bg-blue-500/10",
  violet: "bg-violet-500/10",
  cyan: "bg-cyan-500/10",
  green: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  rose: "bg-rose-500/10",
  slate: "bg-slate-400/10",
};

const DOC_KINDS = new Set(["cld_file", "library_doc"]);

export interface RagHitCardProps {
  view: RagHitView;
  variant?: "compact" | "expanded";
  /** Top score in the result set, for the relative relevance bar. */
  topScore?: number;
  /** 1-based rank, shown as #N on the expanded lab card. */
  rank?: number | null;
  /** Canonical deep-link (Open source, new tab). */
  href: string;
  /** Open the source in its in-app window. */
  onOpen: () => void;
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function ScoreBadge({ view, tier }: { view: RagHitView; tier: RelevanceTier }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset",
        tier.badge,
      )}
      title={`${tier.label} · score ${view.score.toFixed(3)}`}
    >
      {view.score.toFixed(2)}
    </span>
  );
}

function EntityOnlyBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300"
      title="Surfaced only because its source mentions a matched entity — no semantic (vector) or keyword (lexical) match. Treat with care."
    >
      <TriangleAlert className="h-3 w-3" />
      entity only
    </span>
  );
}

function RankChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      {label}{" "}
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

/** Relevance bar + tier + the rank breakdown + entity mentions (+ chunk_id). */
function HitBreakdown({
  view,
  topScore,
  tier,
  showChunkId = false,
}: {
  view: RagHitView;
  topScore: number;
  tier: RelevanceTier;
  showChunkId?: boolean;
}) {
  const rel = relativeStrength(view.score, topScore);
  const entities = view.entities.slice(0, 8);
  return (
    <div className="space-y-2">
      {/* Relevance — tier label, relative bar, absolute score */}
      <div className="flex items-center gap-2">
        <span className={cn("text-[11px] font-semibold", tier.text)}>
          {tier.label}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", tier.bar)}
            style={{ width: `${Math.round(rel * 100)}%` }}
          />
        </div>
        <span className={cn("text-xs font-semibold tabular-nums", tier.text)}>
          {view.score.toFixed(2)}
        </span>
      </div>

      {/* Rank breakdown */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
        {view.vectorRank != null ? (
          <RankChip label="vector" value={`#${view.vectorRank}`} />
        ) : null}
        {view.lexicalRank != null ? (
          <RankChip label="lexical" value={`#${view.lexicalRank}`} />
        ) : null}
        {view.rerankScore != null ? (
          <RankChip label="rerank" value={view.rerankScore.toFixed(2)} />
        ) : null}
        {view.entityRank != null ? (
          <RankChip label="entity" value={`#${view.entityRank}`} />
        ) : null}
        {view.pageNumber != null ? (
          <RankChip label="page" value={view.pageNumber} />
        ) : null}
      </div>

      {/* Why it ranked — KG entity mentions */}
      {entities.length ? (
        <div className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Mentions</span>{" "}
          {entities.join(", ")}
        </div>
      ) : null}

      {/* chunk_id (lab) */}
      {showChunkId ? (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">chunk_id</span>
          <code className="min-w-0 flex-1 truncate font-mono">{view.chunkId}</code>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(view.chunkId);
              toast.success("chunk_id copied");
            }}
            aria-label="Copy chunk id"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OpenButton({
  view,
  onOpen,
  className,
}: {
  view: RagHitView;
  onOpen: () => void;
  className?: string;
}) {
  const isDoc = DOC_KINDS.has(view.sourceKind);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        isDoc && view.pageNumber != null
          ? `Inspect page ${view.pageNumber} of the source`
          : "Open source in a window"
      }
      aria-label="Open source"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <PanelRight className="h-4 w-4" />
    </button>
  );
}

// ── The card ─────────────────────────────────────────────────────────────────

export function RagHitCard({
  view,
  variant = "compact",
  topScore,
  rank,
  href,
  onOpen,
}: RagHitCardProps) {
  const kg = kindGlyph(view.sourceKind);
  const Icon = kg.icon;
  const tier = scoreTier(view.score);
  const top = topScore ?? view.score;
  const isDoc = DOC_KINDS.has(view.sourceKind);
  const entityOnly = isEntityOnly(view);
  const title = view.title ?? `#${view.sourceId.slice(0, 8)}`;
  const subtitle =
    (view.pageNumber != null ? `${kg.label} · Page ${view.pageNumber}` : kg.label) +
    (view.libraryShortCode ? ` · ${view.libraryShortCode}` : "");

  // ── expanded (search lab) ──────────────────────────────────────────────────
  if (variant === "expanded") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          {rank != null ? (
            <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {rank}
            </span>
          ) : null}
          <ToolGlyph icon={Icon} accent={kg.accent} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight text-foreground">
              {title}
            </div>
            <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
              {subtitle}
            </div>
          </div>
          {entityOnly ? <EntityOnlyBadge /> : null}
          <ScoreBadge view={view} tier={tier} />
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open source in a new tab"
            aria-label="Open source in a new tab"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <OpenButton view={view} onOpen={onOpen} />
        </div>

        <div className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed text-foreground">
          {view.snippet}
        </div>

        <div className="border-t border-border bg-muted/20 px-3 py-2">
          <HitBreakdown view={view} topScore={top} tier={tier} showChunkId />
        </div>
      </div>
    );
  }

  // ── compact (chat + omnibox) ───────────────────────────────────────────────
  return (
    <PartPeekPopover
      className="w-[380px]"
      headerClassName={HEADER_WASH[kg.accent] ?? "bg-muted/40"}
      header={
        <span className="flex items-center gap-1.5 normal-case">
          <ToolGlyph icon={Icon} accent={kg.accent} size="sm" />
          <span className="truncate font-medium text-foreground">{title}</span>
        </span>
      }
      body={
        <div className="space-y-2.5">
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {view.snippet}
          </div>
          <div className="border-t border-border pt-2">
            <HitBreakdown view={view} topScore={top} tier={tier} />
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <PanelRight className="h-3.5 w-3.5" />
              {isDoc && view.pageNumber != null
                ? `Inspect page ${view.pageNumber}`
                : "Open in window"}
            </button>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open source
            </a>
          </div>
        </div>
      }
    >
      <div className="group/row flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40">
        <ToolGlyph icon={Icon} accent={kg.accent} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight text-foreground">
            {title}
          </div>
          <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </div>
        </div>
        {entityOnly ? <EntityOnlyBadge /> : null}
        <ScoreBadge view={view} tier={tier} />
        <OpenButton view={view} onOpen={onOpen} />
      </div>
    </PartPeekPopover>
  );
}
