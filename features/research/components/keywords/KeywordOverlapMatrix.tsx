"use client";

/**
 * Keyword-overlap visualization for the keyword overview.
 *
 * A websearch returns up to 100 results per keyword. The single best signal of
 * whether a user picked keywords that actually circle the SAME goal is OVERLAP:
 * how often the same source surfaces under more than one keyword. Lots of shared
 * sources ⇒ the keywords are honed on one target (focused). Little or none ⇒ the
 * keywords are pulling in different directions (broad) — worth warning about.
 *
 * Two coordinated reads, derived purely from `curation.rows[].importance.perKeyword`:
 *   1. A keyword × keyword matrix where cell (i,j) = the number of sources that
 *      appeared under BOTH keyword i and keyword j. The diagonal is that
 *      keyword's own total source count. Denser/darker cells = more shared
 *      sources = more focused research.
 *   2. A plain-language "focus" summary: the share of sources that overlap across
 *      keywords, a Focused / Balanced / Broad verdict, and an explicit warning
 *      when overlap is ~0.
 *
 * Pure presentation — all data arrives via props from `useCurationData`. No
 * hard-coded brights; intensity is a scaled `primary` tint so it reads cleanly
 * in light and dark mode.
 */

import { useMemo, useState } from "react";
import {
  Network,
  ChevronDown,
  ChevronUp,
  Target,
  AlertTriangle,
  Info,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { fmtCount } from "../../format";
import type { CurationRow } from "../../service";

interface KeywordOverlapMatrixProps {
  rows: CurationRow[];
  keywords: { id: string; keyword: string }[];
  className?: string;
}

/** A keyword reduced to the shape the matrix needs. */
interface KwNode {
  id: string;
  label: string;
  /** Total distinct sources that appeared under this keyword. */
  total: number;
}

interface OverlapModel {
  nodes: KwNode[];
  /** Symmetric matrix: pair[i][j] = sources shared by keyword i AND keyword j. */
  pair: number[][];
  /** Largest off-diagonal pair value, for color scaling. 0 if no overlap. */
  maxPair: number;
  /** Distinct sources that appeared under at least one keyword. */
  sourcesWithKeyword: number;
  /** Distinct sources that appeared under MORE THAN ONE keyword. */
  overlapSources: number;
  /** overlapSources / sourcesWithKeyword, 0..1 (0 when no keyworded sources). */
  overlapRatio: number;
  /** Keyword ids that share no source with any other keyword (isolated). */
  isolatedKeywordIds: string[];
}

type FocusLevel = "focused" | "balanced" | "broad" | "warning" | "insufficient";

interface FocusVerdict {
  level: FocusLevel;
  /** Short headline label. */
  title: string;
  /** Plain-language explanation tied to the numbers. */
  detail: string;
}

// Tuning lives here, not scattered in JSX. Thresholds are on the overlap ratio
// (share of keyworded sources that appear under more than one keyword).
const FOCUS = {
  /** At/above this ratio the keywords are clearly honed on one goal. */
  focusedAt: 0.35,
  /** At/above this (and below focusedAt) they meaningfully converge. */
  balancedAt: 0.12,
  /** Below this ratio overlap is effectively noise — warn. */
  warnBelow: 0.02,
} as const;

/** Build the full overlap model from curation rows + the keyword list. */
function buildOverlapModel(
  rows: CurationRow[],
  keywords: { id: string; keyword: string }[],
): OverlapModel {
  const nodes: KwNode[] = keywords.map((k) => ({
    id: k.id,
    label: k.keyword,
    total: 0,
  }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const n = nodes.length;
  const pair: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );

  let sourcesWithKeyword = 0;
  let overlapSources = 0;

  for (const row of rows) {
    // Only keyword ids we actually render, de-duplicated per source.
    const kwIds: number[] = [];
    const seen = new Set<number>();
    for (const pk of row.importance?.perKeyword ?? []) {
      const idx = index.get(pk.keyword_id);
      if (idx === undefined || seen.has(idx)) continue;
      seen.add(idx);
      kwIds.push(idx);
    }
    if (kwIds.length === 0) continue;

    sourcesWithKeyword += 1;
    if (kwIds.length > 1) overlapSources += 1;

    // Diagonal = per-keyword totals; off-diagonal = shared-source pair counts.
    for (let a = 0; a < kwIds.length; a++) {
      const ia = kwIds[a];
      nodes[ia].total += 1;
      pair[ia][ia] += 1;
      for (let b = a + 1; b < kwIds.length; b++) {
        const ib = kwIds[b];
        pair[ia][ib] += 1;
        pair[ib][ia] += 1;
      }
    }
  }

  let maxPair = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      maxPair = Math.max(maxPair, pair[i][j]);
    }
  }

  const isolatedKeywordIds: string[] = [];
  for (let i = 0; i < n; i++) {
    if (nodes[i].total === 0) continue; // never searched / no results — not "isolated"
    let sharesAny = false;
    for (let j = 0; j < n; j++) {
      if (j !== i && pair[i][j] > 0) {
        sharesAny = true;
        break;
      }
    }
    if (!sharesAny) isolatedKeywordIds.push(nodes[i].id);
  }

  return {
    nodes,
    pair,
    maxPair,
    sourcesWithKeyword,
    overlapSources,
    overlapRatio:
      sourcesWithKeyword > 0 ? overlapSources / sourcesWithKeyword : 0,
    isolatedKeywordIds,
  };
}

/** Translate the overlap ratio into a focus verdict with plain-language copy. */
function focusVerdict(model: OverlapModel): FocusVerdict {
  const { overlapRatio, sourcesWithKeyword, nodes, overlapSources } = model;
  const activeKeywords = nodes.filter((nd) => nd.total > 0).length;
  const pct = Math.round(overlapRatio * 100);

  // Not enough to judge: need at least two keywords that actually returned results.
  if (activeKeywords < 2 || sourcesWithKeyword === 0) {
    return {
      level: "insufficient",
      title: "Not enough to compare",
      detail:
        activeKeywords < 2
          ? "Add and search a second keyword to see how well your keywords overlap."
          : "Run searches on these keywords to measure how much their sources overlap.",
    };
  }

  if (overlapRatio < FOCUS.warnBelow) {
    return {
      level: "warning",
      title: "Keywords may be too far apart",
      detail:
        "Almost no source came up under more than one keyword. These keywords are pulling in different directions — consider tightening them around a single question.",
    };
  }
  if (overlapRatio >= FOCUS.focusedAt) {
    return {
      level: "focused",
      title: "Focused",
      detail: `${pct}% of sources appear under more than one keyword — your keywords are honed on the same goal.`,
    };
  }
  if (overlapRatio >= FOCUS.balancedAt) {
    return {
      level: "balanced",
      title: "Balanced",
      detail: `${pct}% of sources overlap across keywords — a healthy mix of shared and unique coverage.`,
    };
  }
  return {
    level: "broad",
    title: "Broad",
    detail: `Only ${pct}% of sources (${fmtCount(overlapSources)}) overlap — your keywords cover a wide area with little common ground. Tighten them to go deeper.`,
  };
}

// Verdict accent: restrained, theme-aware, never a bright kindergarten chip.
const VERDICT_STYLE: Record<
  FocusLevel,
  { dot: string; chip: string; Icon: typeof Target }
> = {
  focused: {
    dot: "bg-emerald-500",
    chip: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    Icon: Target,
  },
  balanced: {
    dot: "bg-primary",
    chip: "text-primary bg-primary/10 border-primary/20",
    Icon: Layers,
  },
  broad: {
    dot: "bg-amber-500",
    chip: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    Icon: Network,
  },
  warning: {
    dot: "bg-amber-500",
    chip: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
    Icon: AlertTriangle,
  },
  insufficient: {
    dot: "bg-muted-foreground/40",
    chip: "text-muted-foreground bg-muted/40 border-border/50",
    Icon: Info,
  },
};

/**
 * A single matrix cell's tint. Diagonal cells use a neutral surface (they are a
 * total, not a shared count); off-diagonal cells scale a `primary` tint by how
 * close the pair count is to the densest pair. Color carries meaning, but stays
 * inside theme tokens so it's legible in both modes.
 */
function cellStyle(
  value: number,
  maxPair: number,
  isDiagonal: boolean,
): { className: string; style: React.CSSProperties } {
  if (isDiagonal) {
    return {
      className: "text-foreground/80 font-semibold border-border/60",
      style: { backgroundColor: "hsl(var(--muted))" },
    };
  }
  if (value <= 0) {
    return {
      className: "text-muted-foreground/30 border-border/40",
      style: {},
    };
  }
  // Perceptual-ish ramp via sqrt so a single shared source is already visible.
  const t = maxPair > 0 ? Math.sqrt(value / maxPair) : 0;
  const alpha = 0.1 + t * 0.75; // 0.10 → 0.85
  return {
    className: cn(
      "border-transparent font-semibold",
      t > 0.55 ? "text-primary-foreground" : "text-foreground/80",
    ),
    style: { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(2)})` },
  };
}

export default function KeywordOverlapMatrix({
  rows,
  keywords,
  className,
}: KeywordOverlapMatrixProps) {
  const [open, setOpen] = useState(true);

  const model = useMemo(
    () => buildOverlapModel(rows, keywords),
    [rows, keywords],
  );
  const verdict = useMemo(() => focusVerdict(model), [model]);

  // Render only keywords that actually returned at least one source, sorted by
  // breadth (most sources first) so the densest corner reads top-left.
  const ordered = useMemo(() => {
    const withIdx = model.nodes
      .map((node, i) => ({ node, i }))
      .filter((x) => x.node.total > 0);
    withIdx.sort((a, b) => b.node.total - a.node.total);
    return withIdx;
  }, [model]);

  // Nothing searched yet → don't show a chart of zeros, show the guidance state.
  if (model.nodes.length === 0) return null;

  const style = VERDICT_STYLE[verdict.level];
  const VIcon = style.Icon;
  const showMatrix = ordered.length >= 2;
  const isolatedLabels = model.nodes
    .filter((n) => model.isolatedKeywordIds.includes(n.id))
    .map((n) => n.label);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden",
        className,
      )}
    >
      {/* Header / verdict summary — always visible, collapses the matrix only. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 p-2.5 text-left transition-colors hover:bg-muted/30"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            style.chip,
          )}
        >
          <VIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Keyword overlap
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
                style.chip,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
              {verdict.title}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {verdict.detail}
          </p>
        </div>
        {/* Headline metric — the share that overlaps — reads at a glance. */}
        {verdict.level !== "insufficient" && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold leading-none tabular-nums">
              {Math.round(model.overlapRatio * 100)}%
            </div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
              overlap
            </div>
          </div>
        )}
        <span className="shrink-0 text-muted-foreground">
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/40 p-3">
          {/* Compact metric row — the "expensive work" framing used elsewhere. */}
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            <MetricTile
              value={fmtCount(model.overlapSources)}
              label="Shared sources"
              hint="Sources that appeared under more than one keyword."
            />
            <MetricTile
              value={fmtCount(model.sourcesWithKeyword)}
              label="Total sources"
              hint="Distinct sources found across all keywords."
            />
            <MetricTile
              value={model.maxPair > 0 ? fmtCount(model.maxPair) : "0"}
              label="Densest pair"
              hint="Most sources shared by any single pair of keywords."
            />
          </div>

          {showMatrix ? (
            <OverlapGrid model={model} ordered={ordered} />
          ) : (
            <p className="rounded-lg border border-dashed border-border/50 bg-muted/20 px-3 py-4 text-center text-[11px] text-muted-foreground">
              Search a second keyword to compare how much their sources overlap.
            </p>
          )}

          {/* Explicit warning surface for isolated keywords — actionable. */}
          {isolatedLabels.length > 0 && showMatrix && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-2">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300/90">
                <span className="font-medium">
                  {isolatedLabels.length === 1
                    ? "1 keyword shares no sources"
                    : `${isolatedLabels.length} keywords share no sources`}
                </span>{" "}
                with the others
                {isolatedLabels.length <= 3 && (
                  <>
                    {" — "}
                    <span className="font-medium">
                      {isolatedLabels.join(", ")}
                    </span>
                  </>
                )}
                . They may be too far from the rest of your research.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The keyword × keyword heatmap itself, with a legend. */
function OverlapGrid({
  model,
  ordered,
}: {
  model: OverlapModel;
  ordered: { node: KwNode; i: number }[];
}) {
  const labelW = 132; // px reserved for the left-hand keyword labels

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Column header row — rotated keyword labels above each column. */}
          <div className="flex" style={{ paddingLeft: labelW }}>
            {ordered.map(({ node }) => (
              <div
                key={node.id}
                className="flex h-16 w-9 items-end justify-center"
              >
                <span
                  className="block max-w-[60px] truncate text-[9px] text-muted-foreground"
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                  title={node.label}
                >
                  {node.label}
                </span>
              </div>
            ))}
          </div>

          {/* One row per keyword. */}
          {ordered.map(({ node: rowNode, i: ri }) => (
            <div key={rowNode.id} className="flex items-center">
              <div
                className="truncate pr-2 text-right text-[10px] font-medium text-foreground/80"
                style={{ width: labelW }}
                title={rowNode.label}
              >
                {rowNode.label}
              </div>
              {ordered.map(({ node: colNode, i: ci }) => {
                const value = model.pair[ri][ci];
                const isDiagonal = ri === ci;
                const { className, style } = cellStyle(
                  value,
                  model.maxPair,
                  isDiagonal,
                );
                return (
                  <Tooltip key={colNode.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "m-px flex h-8 w-8 items-center justify-center rounded-[5px] border text-[10px] tabular-nums transition-transform hover:scale-[1.12] hover:ring-1 hover:ring-primary/40",
                          className,
                        )}
                        style={style}
                      >
                        {value > 0 ? value : ""}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px]">
                      {isDiagonal ? (
                        <span>
                          <span className="font-semibold">{rowNode.label}</span>{" "}
                          — {fmtCount(value)} total source
                          {value === 1 ? "" : "s"}
                        </span>
                      ) : value > 0 ? (
                        <span>
                          <span className="font-semibold">{fmtCount(value)}</span>{" "}
                          shared source{value === 1 ? "" : "s"} between{" "}
                          <span className="font-medium">{rowNode.label}</span>{" "}
                          and{" "}
                          <span className="font-medium">{colNode.label}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          No shared sources between{" "}
                          <span className="font-medium text-popover-foreground">
                            {rowNode.label}
                          </span>{" "}
                          and{" "}
                          <span className="font-medium text-popover-foreground">
                            {colNode.label}
                          </span>
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend — diagonal vs scaled overlap intensity. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span
            className="h-3 w-3 rounded-[3px] border border-border/60"
            style={{ backgroundColor: "hsl(var(--muted))" }}
          />
          keyword total
        </span>
        <span className="inline-flex items-center gap-1">
          fewer shared
          <span className="inline-flex">
            {[0.14, 0.32, 0.55, 0.85].map((a) => (
              <span
                key={a}
                className="h-3 w-3 rounded-[2px]"
                style={{
                  backgroundColor: `hsl(var(--primary) / ${a})`,
                }}
              />
            ))}
          </span>
          more shared
        </span>
      </div>
    </div>
  );
}

/** A compact summary metric with an on-hover explanation. */
function MetricTile({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div className="rounded-lg border border-border/40 bg-card/40 px-2 py-1.5 text-left">
          <div className="text-base font-bold leading-none tabular-nums">
            {value}
          </div>
          <p className="mt-1 truncate text-[9px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px] text-[11px]">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
