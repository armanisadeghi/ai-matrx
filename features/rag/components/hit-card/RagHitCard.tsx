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

import { useId, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  ExternalLink,
  FileText,
  ImageIcon,
  PanelRight,
  Puzzle,
  Table2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { FileIcon } from "@/features/files";
import type { ToolAccent } from "@/features/tool-call-visualization/types";
import { ToolGlyph } from "@/features/tool-call-visualization/renderers/_shared-entity/ToolGlyph";
import { PartPeekPopover } from "@/features/tool-call-visualization/renderers/_shared-entity/PartPeekPopover";
import { scoreTier, relativeStrength, type RelevanceTier } from "./scoreTier";
import { kindGlyph } from "./kindGlyph";
import { type RagHitView, isEntityOnly } from "./types";
import { getQueryHighlightSegments } from "./query-highlighting";
import {
  RagAiCopyButton,
  RagContentActions,
} from "@/features/rag/components/search/RagContentActions";
import {
  createRagAiCopyBundle,
  type RagAiCopyBundle,
} from "@/features/rag/components/search/ragAiCopy";
import {
  EMPTY_RAG_REFERENCE_AVAILABILITY,
  type RagReferenceAvailability,
  type RagReferenceKind,
  type RagReferenceRequest,
} from "./referenceTypes";

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
const CUSTOM_REFERENCE_KINDS = new Set([
  "agent_extract",
  "agent_summary",
  "agent_structured_json",
  "custom",
  "custom_extraction",
  "synthetic_qa",
  "section_summary",
]);

const REFERENCE_ICONS = [
  { kind: "document", label: "Document", icon: FileText },
  { kind: "clean", label: "Clean text", icon: BookOpenText },
  { kind: "image", label: "Image", icon: ImageIcon },
  { kind: "table", label: "Table", icon: Table2 },
  { kind: "custom", label: "Custom content", icon: Puzzle },
] as const;

const CHUNK_KIND_LABELS: Record<string, string> = {
  chunked_coarse: "Coarse passage",
  chunked_fine: "Fine passage",
  table: "Table",
  image: "Image",
  page: "Page",
};

function chunkKindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return (
    CHUNK_KIND_LABELS[kind] ??
    kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function inferredReferenceAvailability(
  view: RagHitView,
): RagReferenceAvailability {
  const chunkKind = view.chunkKind?.toLowerCase() ?? "";
  const derivationKind =
    typeof view.metadata["derivation_kind"] === "string"
      ? view.metadata["derivation_kind"].toLowerCase()
      : "";
  const identity = `${chunkKind} ${derivationKind}`;
  const isDocument = DOC_KINDS.has(view.sourceKind);

  return {
    document: isDocument,
    clean: isDocument && view.pageNumber != null,
    image: /(^|\s|_)(image|page_image|page_image_caption)(\s|_|$)/.test(
      identity,
    ),
    table:
      /(^|\s|_)table(_row)?(\s|_|$)/.test(identity) ||
      typeof view.metadata["table_rows"] === "number" ||
      Array.isArray(view.metadata["table_header"]),
    custom:
      CUSTOM_REFERENCE_KINDS.has(chunkKind) ||
      CUSTOM_REFERENCE_KINDS.has(derivationKind),
  };
}

export interface RagHitResourceControls {
  request: RagReferenceRequest | null;
  onAvailabilityChange: (availability: RagReferenceAvailability) => void;
  aiBundle: RagAiCopyBundle;
}

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
  /** Search query used to highlight word chains in expanded snippets. */
  highlightQuery?: string;
  /** Initial disclosure state for the expanded search-lab card. */
  defaultExpanded?: boolean;
  /** Controlled disclosure state for result-list bulk controls. */
  expanded?: boolean;
  /** Notifies controlled callers and individual-card toggles. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Replaces the default snippet body while preserving its highlighted node. */
  expandedContent?: (
    snippet: React.ReactNode,
    resources: RagHitResourceControls,
  ) => React.ReactNode;
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
      {label} <span className="font-semibold text-foreground">{value}</span>
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

      {/* Result identity stays at the bottom of the expanded card. */}
      {showChunkId ? (
        <div className="flex items-center gap-2 border-t border-border/70 pt-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Result:</span>
          <MatrxUuidCell
            value={view.chunkId}
            label="RAG result chunk ID"
            className="min-w-0"
          />
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

function SourceIdentity({
  view,
  title,
  typeLabel,
  aiBundle,
  compact = false,
}: {
  view: RagHitView;
  title: string;
  typeLabel: string;
  aiBundle: RagAiCopyBundle;
  compact?: boolean;
}) {
  const resultType = chunkKindLabel(view.chunkKind);
  return (
    <div
      className={cn(
        "min-w-0 select-none",
        compact ? "space-y-0.5" : "space-y-1",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          Source:
        </span>
        <span
          className={cn(
            "min-w-0 truncate font-medium text-foreground",
            compact ? "max-w-52 text-xs" : "max-w-[min(36rem,55vw)] text-sm",
          )}
          title={title}
        >
          {title}
        </span>
        <MatrxUuidCell
          value={view.sourceId}
          label={`${typeLabel} source ID`}
          trailing={
            <RagAiCopyButton
              label={`${title} result reference`}
              bundle={aiBundle}
            />
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs leading-tight text-muted-foreground">
        <span>
          <span className="font-medium text-foreground/80">Type:</span>{" "}
          {typeLabel}
        </span>
        {resultType ? (
          <>
            <span aria-hidden="true">|</span>
            <span>
              <span className="font-medium text-foreground/80">
                Result type:
              </span>{" "}
              {resultType}
            </span>
          </>
        ) : null}
        {view.pageNumber != null ? (
          <>
            <span aria-hidden="true">|</span>
            <span>
              <span className="font-medium text-foreground/80">Page:</span>{" "}
              {view.pageNumber}
            </span>
          </>
        ) : null}
        {view.libraryShortCode ? (
          <>
            <span aria-hidden="true">|</span>
            <span>
              <span className="font-medium text-foreground/80">Library:</span>{" "}
              {view.libraryShortCode}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SourceGlyph({
  view,
  title,
  icon,
  accent,
  compact = false,
}: {
  view: RagHitView;
  title: string;
  icon: typeof FileText;
  accent: ToolAccent;
  compact?: boolean;
}) {
  const filenameBearing =
    ["cld_file", "library_doc", "code_file"].includes(view.sourceKind) &&
    /\.[a-z0-9]{1,12}$/i.test(title);
  if (filenameBearing) {
    return <FileIcon fileName={title} size={compact ? 18 : 22} />;
  }
  return (
    <ToolGlyph
      icon={icon}
      accent={accent}
      size={compact ? "md" : "lg"}
      className={compact ? undefined : "h-5 w-5"}
    />
  );
}

function ReferenceIconStrip({
  availability,
  requested,
  onSelect,
}: {
  availability: RagReferenceAvailability;
  requested: RagReferenceRequest | null;
  onSelect: (kind: RagReferenceKind) => void;
}) {
  return (
    <div
      className="grid shrink-0 grid-cols-5 gap-0.5"
      aria-label="Available result representations"
    >
      {REFERENCE_ICONS.map(({ kind, label, icon: ResourceIcon }) => {
        const available = availability[kind];
        const active = available && requested?.kind === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={!available}
            aria-label={
              available ? `Show ${label}` : `${label} is not available`
            }
            aria-pressed={active || undefined}
            title={
              available
                ? `Show ${label.toLowerCase()}`
                : `${label} is not available for this result`
            }
            onClick={(event) => {
              event.stopPropagation();
              if (available) onSelect(kind);
            }}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
              available
                ? "border-primary/15 bg-primary/[0.045] text-primary/65 hover:border-primary/30 hover:bg-primary/10 hover:text-primary dark:text-primary/70"
                : "cursor-default border-transparent bg-muted/25 text-muted-foreground/25",
              active &&
                "border-primary/35 bg-primary/12 text-primary ring-1 ring-primary/15",
            )}
          >
            <ResourceIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function HighlightedSnippet({ text, query }: { text: string; query?: string }) {
  if (!query?.trim()) return text;

  return getQueryHighlightSegments(text, query).map((segment, index) => {
    if (!segment.highlighted) return segment.text;

    const strength =
      segment.maxWordCount === 1
        ? 0
        : (segment.wordCount - 1) / (segment.maxWordCount - 1);
    const hue = Math.round(42 + strength * 150);

    return (
      <mark
        key={`${index}-${segment.wordCount}`}
        className="rounded-[3px] text-inherit box-decoration-clone"
        style={{
          backgroundColor: `hsl(${hue} 85% 52% / 0.24)`,
          boxShadow: `inset 0 -2px 0 hsl(${hue} 78% 44% / 0.65)`,
        }}
        title={`${segment.wordCount}-word query-term chain`}
      >
        {segment.text}
      </mark>
    );
  });
}

// ── The card ─────────────────────────────────────────────────────────────────

export function RagHitCard({
  view,
  variant = "compact",
  topScore,
  rank,
  href,
  onOpen,
  highlightQuery,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  expandedContent,
}: RagHitCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [resolvedAvailability, setResolvedAvailability] =
    useState<RagReferenceAvailability>(EMPTY_RAG_REFERENCE_AVAILABILITY);
  const [referenceRequest, setReferenceRequest] =
    useState<RagReferenceRequest | null>(null);
  const expanded = controlledExpanded ?? internalExpanded;
  const contentId = useId();
  const kg = kindGlyph(view.sourceKind);
  const Icon = kg.icon;
  const tier = scoreTier(view.score);
  const top = topScore ?? view.score;
  const isDoc = DOC_KINDS.has(view.sourceKind);
  const entityOnly = isEntityOnly(view);
  const title =
    view.title ?? (isDoc ? "Filename unavailable" : `${kg.label} source`);
  const aiBundle = createRagAiCopyBundle(view, title, kg.label, href);
  const inferredAvailability = inferredReferenceAvailability(view);
  const referenceAvailability: RagReferenceAvailability = {
    document: inferredAvailability.document || resolvedAvailability.document,
    clean: inferredAvailability.clean || resolvedAvailability.clean,
    image: inferredAvailability.image || resolvedAvailability.image,
    table: inferredAvailability.table || resolvedAvailability.table,
    custom: inferredAvailability.custom || resolvedAvailability.custom,
  };
  const setExpanded = (next: boolean) => {
    if (controlledExpanded == null) setInternalExpanded(next);
    onExpandedChange?.(next);
  };
  const selectReference = (kind: RagReferenceKind) => {
    if (kind === "document") {
      onOpen();
      return;
    }
    setReferenceRequest((current) => ({
      kind,
      nonce: (current?.nonce ?? 0) + 1,
    }));
    setExpanded(true);
  };

  // ── expanded (search lab) ──────────────────────────────────────────────────
  if (variant === "expanded") {
    return (
      <div
        className="overflow-hidden rounded-xl border border-border bg-card"
        data-rag-source-id={view.sourceId}
        data-rag-chunk-id={view.chunkId}
      >
        <div
          className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-muted/30"
          onClick={() => setExpanded(!expanded)}
        >
          {rank != null ? (
            <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {rank}
            </span>
          ) : null}
          <SourceGlyph
            view={view}
            title={title}
            icon={Icon}
            accent={kg.accent}
          />
          <div className="min-w-0 flex-1">
            <SourceIdentity
              view={view}
              title={title}
              typeLabel={kg.label}
              aiBundle={aiBundle}
            />
          </div>
          {entityOnly ? <EntityOnlyBadge /> : null}
          <ScoreBadge view={view} tier={tier} />
          <ReferenceIconStrip
            availability={referenceAvailability}
            requested={referenceRequest}
            onSelect={selectReference}
          />
          <OpenButton view={view} onOpen={onOpen} />
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            title="Open source in a new tab"
            aria-label="Open source in a new tab"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={`${expanded ? "Collapse" : "Expand"} result ${rank ?? ""}: ${title}`}
            title={expanded ? "Collapse result" : "Expand result"}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        </div>

        {expanded ? (
          <div id={contentId}>
            {expandedContent ? (
              expandedContent(
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  <HighlightedSnippet
                    text={view.snippet}
                    query={highlightQuery}
                  />
                </div>,
                {
                  request: referenceRequest,
                  onAvailabilityChange: setResolvedAvailability,
                  aiBundle,
                },
              )
            ) : (
              <div className="px-3 py-2.5">
                <div className="mb-1 flex justify-end">
                  <RagContentActions
                    humanText={view.snippet}
                    label="retrieved content"
                    bundle={aiBundle}
                    initialSections={["retrieved"]}
                  />
                </div>
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  <HighlightedSnippet
                    text={view.snippet}
                    query={highlightQuery}
                  />
                </div>
              </div>
            )}

            <div className="border-t border-border bg-muted/20 px-3 py-2">
              <HitBreakdown
                view={view}
                topScore={top}
                tier={tier}
                showChunkId
              />
            </div>
          </div>
        ) : null}
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
          <SourceGlyph
            view={view}
            title={title}
            icon={Icon}
            accent={kg.accent}
            compact
          />
          <span className="truncate font-medium text-foreground">{title}</span>
        </span>
      }
      body={
        <div className="space-y-2.5">
          <SourceIdentity
            view={view}
            title={title}
            typeLabel={kg.label}
            aiBundle={aiBundle}
            compact
          />
          <div className="border-t border-border" />
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Retrieved content
              </span>
              <RagContentActions
                humanText={view.snippet}
                label="retrieved content"
                bundle={aiBundle}
                initialSections={["retrieved"]}
              />
            </div>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {view.snippet}
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <HitBreakdown view={view} topScore={top} tier={tier} showChunkId />
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
      <div
        className="group/row flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
        data-rag-source-id={view.sourceId}
        data-rag-chunk-id={view.chunkId}
      >
        <SourceGlyph view={view} title={title} icon={Icon} accent={kg.accent} />
        <div className="min-w-0 flex-1">
          <SourceIdentity
            view={view}
            title={title}
            typeLabel={kg.label}
            aiBundle={aiBundle}
            compact
          />
        </div>
        {entityOnly ? <EntityOnlyBadge /> : null}
        <ScoreBadge view={view} tier={tier} />
        <OpenButton view={view} onOpen={onOpen} />
      </div>
    </PartPeekPopover>
  );
}
