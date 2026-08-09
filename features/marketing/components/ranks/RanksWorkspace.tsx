"use client";

/**
 * Rank tracking workspace (WS-10 / M-34..M-37) — the site's rank portfolio:
 * add/remove/group tracked keywords, per-target position + movement + best
 * position, a one-shot live check button, and a history drill-in (chart +
 * table + competitive SERP landscape).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingRanksScope } from "@/features/surfaces/manifests/marketing-ranks.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { RankSparkline } from "./RankSparkline";
import {
  humanHistory,
  humanLandscape,
  humanLandscapeResult,
  humanRankPortfolio,
  humanRankPortfolioItem,
  projectRankPortfolioItem,
} from "./format";
import {
  usePortfolio,
  useRankTargetHistory,
  useRunRankCheck,
} from "./useRanks";
import { TRACKING_MODES } from "./types";
import type {
  AddRankTargetInput,
  AiAnswerEngine,
  RankPortfolioItem,
  RankProvider,
  RankTargetHistoryPoint,
  SerpLandscape,
} from "./types";

/** Wire value for one `track_keywords` entry (see the manifest's contract). */
interface TrackKeywordsEntry {
  keyword: string;
  mode: string;
  location_name?: string;
  cadence_days?: number;
}

/**
 * Validate one agent-supplied `track_keywords` entry against the REAL
 * tracking-mode catalog and return the canonical add-target input — the same
 * shape `AddTargetForm.submit` builds. Throws on any contract break; the
 * writeback seam turns throws into the loud error envelope the agent reads.
 */
function toAddTargetInput(raw: unknown, index: number): AddRankTargetInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `track_keywords: entry ${index + 1} must be an object { keyword, mode, location_name?, cadence_days? }.`,
    );
  }
  const entry = raw as Partial<TrackKeywordsEntry>;
  const keyword =
    typeof entry.keyword === "string" ? entry.keyword.trim() : "";
  if (!keyword) {
    throw new Error(
      `track_keywords: entry ${index + 1} needs a non-empty keyword.`,
    );
  }
  const mode = TRACKING_MODES.find((m) => m.id === entry.mode);
  if (!mode) {
    throw new Error(
      `track_keywords: entry ${index + 1} ("${keyword}") has unknown mode "${String(entry.mode)}". Valid modes: ${TRACKING_MODES.map((m) => m.id).join(", ")}.`,
    );
  }
  const locationName =
    typeof entry.location_name === "string" ? entry.location_name.trim() : "";
  if (mode.location === "required" && !locationName) {
    throw new Error(
      `track_keywords: entry ${index + 1} ("${keyword}") — ${mode.label} requires location_name (e.g. "Los Angeles, California, United States").`,
    );
  }
  let cadenceDays = 7;
  if (entry.cadence_days !== undefined) {
    if (
      typeof entry.cadence_days !== "number" ||
      !Number.isInteger(entry.cadence_days) ||
      entry.cadence_days < 1 ||
      entry.cadence_days > 90
    ) {
      throw new Error(
        `track_keywords: entry ${index + 1} ("${keyword}") — cadence_days must be an integer between 1 and 90.`,
      );
    }
    cadenceDays = entry.cadence_days;
  }
  return {
    keyword,
    provider: mode.provider,
    engine: mode.engine ?? undefined,
    search_type: mode.search_type,
    location_name:
      mode.location === "none" ? undefined : locationName || undefined,
    cadence_days: cadenceDays,
  };
}

/**
 * What the open history dialog currently holds. The dialog owns the fetch (and
 * its own expand toggle), but the surface scope is assembled once at the
 * workspace level — so the dialog reports its loaded state up through a ref
 * rather than mounting a second, thinner provider that would shadow the
 * portfolio values.
 */
interface HistorySnapshot {
  points: RankTargetHistoryPoint[];
  landscape: SerpLandscape | null;
  visibleCount: number;
  showingAll: boolean;
  error: string | null;
}

function MovementBadge({ movement }: { movement: number | null }) {
  if (movement === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  if (movement === 0)
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="h-3 w-3" /> 0
      </Badge>
    );
  if (movement > 0)
    return (
      <Badge variant="success" className="gap-1">
        <ChevronUp className="h-3 w-3" /> {movement}
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <ChevronDown className="h-3 w-3" /> {Math.abs(movement)}
    </Badge>
  );
}

function PositionCell({ item }: { item: RankPortfolioItem }) {
  if (item.latest_position === null) {
    return (
      <span className="text-xs text-muted-foreground">
        Not ranked / never checked
      </span>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-foreground">
        #{item.latest_position}
      </span>
      {item.last_checked_at ? (
        <span className="text-[10px] text-muted-foreground">
          {formatDate(item.last_checked_at)}
        </span>
      ) : null}
    </div>
  );
}

function AddTargetForm({
  onAdd,
}: {
  onAdd: (input: {
    keyword: string;
    provider: RankProvider;
    location_name?: string;
    cadence_days: number;
    search_type?: "organic" | "local_pack" | "ai_answer";
    engine?: AiAnswerEngine | null;
  }) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [modeId, setModeId] = useState<string>("google_national");
  const [locationName, setLocationName] = useState("");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const mode = TRACKING_MODES.find((m) => m.id === modeId) ?? TRACKING_MODES[0];

  const submit = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (mode.location === "required" && !locationName.trim()) {
      toast.error(
        `${mode.label} needs a location (e.g. "Los Angeles, California, United States")`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        keyword: trimmed,
        provider: mode.provider,
        engine: mode.engine ?? undefined,
        search_type: mode.search_type,
        location_name:
          mode.location === "none"
            ? undefined
            : locationName.trim() || undefined,
        cadence_days: cadenceDays,
      });
      setKeyword("");
      setLocationName("");
      toast.success(`Tracking "${trimmed}"`);
    } catch (err) {
      toast.error("Could not add rank target", {
        description: extractErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(11rem,13rem)_minmax(0,1fr)_6.25rem_auto] md:items-end">
      <div className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {mode.search_type === "ai_answer" ? "Prompt to track" : "Keyword"}
        </span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. botox cost"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Track in
        </span>
        <Select value={modeId} onValueChange={setModeId}>
          <SelectTrigger className="min-w-0" title={mode.hint}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRACKING_MODES.map((m) => (
              <SelectItem key={m.id} value={m.id} title={m.hint}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {mode.search_type === "ai_answer" ? "City" : "Location"}{" "}
          {mode.location === "required"
            ? "(required)"
            : mode.location === "optional"
              ? "(optional)"
              : "(n/a)"}
        </span>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder={
            mode.search_type === "ai_answer"
              ? "Los Angeles"
              : "Los Angeles, California, United States"
          }
          disabled={mode.location === "none"}
        />
      </div>
      <div className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Cadence (days)
        </span>
        <Input
          type="number"
          min={1}
          max={90}
          value={cadenceDays}
          onChange={(e) => setCadenceDays(Number(e.target.value) || 7)}
        />
      </div>
      <Button
        size="sm"
        className="h-9 shrink-0 gap-1.5"
        disabled={!keyword.trim() || submitting}
        onClick={() => void submit()}
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Track
      </Button>
    </div>
  );
}

function HistoryDialog({
  targetId,
  keyword,
  siteDomain,
  onSnapshot,
  onClose,
}: {
  targetId: string;
  keyword: string;
  siteDomain: string;
  onSnapshot: (snapshot: HistorySnapshot) => void;
  onClose: () => void;
}) {
  const { points, landscape, loading, error } = useRankTargetHistory(targetId);
  const [showAllLandscape, setShowAllLandscape] = useState(false);
  const location = `Marketing — Rank history for "${keyword}" (${siteDomain})`;
  const landscapeResults = landscape?.results ?? [];
  const visibleLandscape = showAllLandscape
    ? landscapeResults
    : landscapeResults.slice(0, 30);

  // Surface emitter feed — keep the workspace scope honest about what this
  // drill-in has actually loaded and how much of it is on screen.
  useEffect(() => {
    onSnapshot({
      points,
      landscape,
      visibleCount: visibleLandscape.length,
      showingAll: showAllLandscape,
      error,
    });
  }, [
    onSnapshot,
    points,
    landscape,
    visibleLandscape.length,
    showAllLandscape,
    error,
  ]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>Position history — {keyword}</DialogTitle>
            {!loading && !error ? (
              <CopyButtons
                size="icon"
                label={`Position history (${keyword})`}
                human={() =>
                  [
                    humanHistory(points),
                    landscape
                      ? humanLandscape(landscape.results, landscape.observed_at)
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n")
                }
                json={() => ({ points, landscape })}
                agent={() => ({
                  kind: "rank-target-history",
                  location,
                  description: `Position history and competitive SERP landscape for "${keyword}".`,
                  data: { points, landscape },
                  summary: humanHistory(points),
                  attributes: { keyword, target_id: targetId },
                })}
              />
            ) : null}
          </div>
        </DialogHeader>
        {loading ? (
          <LoadingSurface label="Loading history…" />
        ) : error ? (
          <QueryError error={new Error(error)} onRetry={() => undefined} />
        ) : (
          <div className="grid gap-4">
            <RankSparkline points={points} />
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observed</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Matched URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-xs text-muted-foreground"
                      >
                        No observations yet — run a check.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...points].reverse().map((point) => (
                      <TableRow key={point.observed_at}>
                        <TableCell className="text-xs">
                          {formatDate(point.observed_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {point.organic_rank === null
                            ? "not ranked"
                            : `#${point.organic_rank}`}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                          {point.matched_url ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {landscape && landscape.results.length > 0 ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Competitive SERP landscape (
                    {formatDate(landscape.observed_at)})
                  </p>
                  {landscapeResults.length > 30 ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => setShowAllLandscape((current) => !current)}
                    >
                      {showAllLandscape
                        ? "top 30"
                        : `all ${landscapeResults.length}`}
                    </button>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "overflow-y-auto rounded-md border border-border",
                    showAllLandscape ? "max-h-96" : "max-h-56",
                  )}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleLandscape.map((result) => (
                        <TableRow
                          key={result.absolute_rank}
                          className="group/serp"
                        >
                          <TableCell className="text-xs">
                            {result.absolute_rank}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs">
                            {result.domain ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                            {result.title ?? result.url ?? "—"}
                          </TableCell>
                          <TableCell>
                            <CopyButtons
                              size="xs"
                              className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/serp:opacity-100"
                              label={`SERP result #${result.absolute_rank}`}
                              human={() => humanLandscapeResult(result)}
                              json={() => result}
                              agent={() => ({
                                kind: "rank-serp-result",
                                location,
                                description: `One competitive SERP landscape result for "${keyword}".`,
                                data: result,
                                summary: humanLandscapeResult(result),
                                attributes: {
                                  absolute_rank: result.absolute_rank,
                                  domain: result.domain ?? undefined,
                                },
                              })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Rollup emitted as the `portfolio_summary` surface value. */
function summarizePortfolio(rows: RankPortfolioItem[]): Record<string, unknown> {
  const ranked = rows.filter((item) => item.latest_position !== null);
  const bests = rows
    .map((item) => item.best_position)
    .filter((value): value is number => value !== null);
  return {
    tracked: rows.length,
    active: rows.filter((item) => item.is_active).length,
    ranked: ranked.length,
    never_checked: rows.filter((item) => item.last_checked_at === null).length,
    average_position:
      ranked.length === 0
        ? null
        : Math.round(
            (ranked.reduce((sum, item) => sum + (item.latest_position ?? 0), 0) /
              ranked.length) *
              10,
          ) / 10,
    improving: rows.filter((item) => (item.movement ?? 0) > 0).length,
    declining: rows.filter((item) => (item.movement ?? 0) < 0).length,
    best_position: bests.length === 0 ? null : Math.min(...bests),
  };
}

export function RanksWorkspace() {
  const { site } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const {
    items,
    loading,
    error,
    reload,
    addTarget,
    updateTarget,
    removeTarget,
  } = usePortfolio(site.id, site.organization_id);
  const [historyTarget, setHistoryTarget] = useState<RankPortfolioItem | null>(
    null,
  );

  // A completed live check lands its fresh row on the run's stream event —
  // reload the whole portfolio so position/movement/best-position stay
  // consistent with the same single source of truth used everywhere else.
  const { checking, run } = useRunRankCheck(() => void reload());

  const rows = items;
  const pageLocation = `Marketing — Rank portfolio for ${site.domain}`;

  // Live drill-in state, reported up by the open history dialog.
  const historySnapshotRef = useRef<HistorySnapshot | null>(null);
  const handleHistorySnapshot = (snapshot: HistorySnapshot) => {
    historySnapshotRef.current = snapshot;
  };

  const getSurfaceScope = () => {
    const snapshot = historyTarget ? historySnapshotRef.current : null;
    const landscapeResults = snapshot?.landscape?.results ?? [];
    return createMarketingRanksScope({
      ...getBaseValues(),
      site_domain: site.domain,
      portfolio_summary: summarizePortfolio(rows),
      rank_portfolio: rows as unknown as Array<Record<string, unknown>>,
      tracking_modes: TRACKING_MODES as unknown as Array<
        Record<string, unknown>
      >,
      portfolio_load_error: error ?? undefined,
      selected_target_id: historyTarget?.target_id,
      selected_target: historyTarget
        ? (historyTarget as unknown as Record<string, unknown>)
        : undefined,
      target_history: snapshot?.points.length
        ? (snapshot.points as unknown as Array<Record<string, unknown>>)
        : undefined,
      serp_landscape: snapshot?.landscape
        ? (snapshot.landscape as unknown as Record<string, unknown>)
        : undefined,
      landscape_view: landscapeResults.length
        ? {
            total_results: landscapeResults.length,
            visible_results: snapshot?.visibleCount ?? 0,
            showing_all: snapshot?.showingAll ?? false,
          }
        : undefined,
      history_load_error: snapshot?.error ?? undefined,
      rank_check_state:
        Object.keys(checking).length > 0
          ? (checking as unknown as Record<string, unknown>)
          : undefined,
    });
  };

  // Write half of the surface (manifest `writeTargets`). Both handlers land
  // through the SAME `usePortfolio` paths as the Track form and the Active
  // switch — never a parallel write. Throws surface through the writeback
  // envelope; partial success on a multi-entry add is reported loudly too.
  const getWriteHandlers = () => ({
    track_keywords: async (value: unknown) => {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(
          "track_keywords expects a non-empty array of { keyword, mode, location_name?, cadence_days? }.",
        );
      }
      const inputs = value.map(toAddTargetInput);
      const added: string[] = [];
      for (const input of inputs) {
        try {
          await addTarget(input);
          added.push(input.keyword);
        } catch (err) {
          throw new Error(
            `track_keywords: "${input.keyword}" failed (${extractErrorMessage(err)})${added.length > 0 ? ` — already tracking: ${added.join(", ")}` : ""}.`,
          );
        }
      }
    },
    set_tracking_active: async (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          "set_tracking_active expects { target_ids: string[], is_active: boolean }.",
        );
      }
      const { target_ids: targetIds, is_active: isActive } = value as {
        target_ids?: unknown;
        is_active?: unknown;
      };
      if (
        !Array.isArray(targetIds) ||
        targetIds.length === 0 ||
        !targetIds.every((id): id is string => typeof id === "string")
      ) {
        throw new Error(
          "set_tracking_active: target_ids must be a non-empty array of target_id strings from rank_portfolio.",
        );
      }
      if (typeof isActive !== "boolean") {
        throw new Error("set_tracking_active: is_active must be a boolean.");
      }
      const known = new Set(items.map((item) => item.target_id));
      const unknown = targetIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new Error(
          `set_tracking_active: not in this portfolio: ${unknown.join(", ")}.`,
        );
      }
      for (const targetId of targetIds) {
        await updateTarget(targetId, { is_active: isActive });
      }
    },
  });

  const withSurface = (children: ReactNode) => (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-ranks"
      getScope={getSurfaceScope}
      getWriteHandlers={getWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );

  if (loading && rows.length === 0) {
    return withSurface(<LoadingSurface label="Loading rank portfolio…" />);
  }
  if (error) {
    return withSurface(
      <QueryError error={new Error(error)} onRetry={() => void reload()} />,
    );
  }

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "portfolio",
      title: "Rank portfolio",
      description: `${rows.length} tracked keywords.`,
      levelLabels: {
        full: `All ${rows.length} (raw)`,
        compact: "Compact fields",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? rows
          : level === "compact"
            ? rows.map(projectRankPortfolioItem)
            : {
                tracked: rows.length,
                active: rows.filter((item) => item.is_active).length,
              },
    },
  ];

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-ranks-page",
    location: pageLocation,
    description: `The full rank tracking portfolio for ${site.domain}.`,
    data: pageFullData(),
    summary: humanRankPortfolio(rows),
    attributes: { site_id: site.id, domain: site.domain, tracked: rows.length },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Rank portfolio — ${site.domain}`,
    kind: "marketing-ranks-page",
    location: pageLocation,
    description: `The full rank tracking portfolio for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    summary: humanRankPortfolio(rows),
    sections: groomerSections(),
  });

  return withSurface(
    <div className="grid gap-4 p-4" data-surface-value="portfolio_summary">
      <SectionCard
        title="Rank portfolio"
        headerExtra={
          <div className="flex items-center gap-1.5">
            <CopyButtons
              size="icon"
              label="Rank portfolio"
              human={() => humanRankPortfolio(rows)}
              json={() => rows}
              agent={pageAgentPayload}
              aiVariants={groomerPresetVariants(groomerConfig)}
            />
            <ExportMenu
              label={`rank-portfolio-${site.domain}`}
              items={[
                jsonExportItem(() => rows, "JSON (all rows, raw)"),
                {
                  id: "csv",
                  label: "CSV (all rows)",
                  build: () => ({
                    content: rowsToCsv(
                      rows.map(projectRankPortfolioItem) as unknown as Array<
                        Record<string, unknown>
                      >,
                    ),
                    extension: "csv",
                    mime: "text/csv",
                  }),
                },
              ]}
            />
            <AgentCopyGroomerLauncher config={groomerConfig} />
            <button
              type="button"
              onClick={() => void reload()}
              className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        <AddTargetForm onAdd={async (input) => void (await addTarget(input))} />
        <div className="overflow-x-auto" data-surface-value="rank_portfolio">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Best</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-xs text-muted-foreground"
                  >
                    No keywords tracked yet — add one above.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((item) => {
                  const state = checking[item.target_id];
                  return (
                    <TableRow key={item.target_id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-sm font-medium text-foreground hover:underline"
                          onClick={() => setHistoryTarget(item)}
                        >
                          {item.keyword}
                        </button>
                      </TableCell>
                      <TableCell>
                        <PositionCell item={item} />
                      </TableCell>
                      <TableCell>
                        <MovementBadge movement={item.movement} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.best_position === null
                          ? "—"
                          : `#${item.best_position}`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.group ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={async (checked) => {
                            try {
                              await updateTarget(item.target_id, {
                                is_active: checked,
                              });
                            } catch (err) {
                              toast.error("Could not update rank target", {
                                description: extractErrorMessage(err),
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <CopyButtons
                            size="icon"
                            label={item.keyword}
                            human={() => humanRankPortfolioItem(item)}
                            json={() => item}
                            agent={() => ({
                              kind: "rank-portfolio-item",
                              location: pageLocation,
                              description: `One tracked rank target for ${site.domain}.`,
                              data: item,
                              summary: humanRankPortfolioItem(item),
                              attributes: {
                                keyword: item.keyword,
                                is_active: item.is_active,
                              },
                            })}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={state?.status === "running"}
                            onClick={() => void run(item.target_id)}
                            title={state?.stage}
                          >
                            {state?.status === "running" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Check now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={async () => {
                              try {
                                await removeTarget(item.target_id);
                                toast.success(`Removed "${item.keyword}"`);
                              } catch (err) {
                                toast.error("Could not remove rank target", {
                                  description: extractErrorMessage(err),
                                });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
      {historyTarget ? (
        <HistoryDialog
          targetId={historyTarget.target_id}
          keyword={historyTarget.keyword}
          siteDomain={site.domain}
          onSnapshot={handleHistorySnapshot}
          onClose={() => {
            historySnapshotRef.current = null;
            setHistoryTarget(null);
          }}
        />
      ) : null}
    </div>,
  );
}
