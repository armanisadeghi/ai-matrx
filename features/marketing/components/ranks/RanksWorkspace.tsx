"use client";

/**
 * Rank tracking workspace (WS-10 / M-34..M-37) — the site's rank portfolio:
 * add/remove/group tracked keywords, per-target position + movement + best
 * position, a one-shot live check button, and a history drill-in (chart +
 * table + competitive SERP landscape).
 */

import { useState } from "react";
import {
  BrainCircuit,
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
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { KeywordInput } from "@/features/marketing/seo/keyword/KeywordInput";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { RankSparkline } from "./RankSparkline";
import {
  humanHistory,
  humanLandscape,
  humanLandscapeResult,
  humanRankPortfolio,
  humanRankPortfolioItem,
  projectRankPortfolioItem,
} from "./format";
import { usePortfolio, useRankTargetHistory, useRunRankCheck } from "./useRanks";
import { TRACKING_MODES } from "./types";
import type { AiAnswerEngine, RankPortfolioItem, RankProvider } from "./types";

function MovementBadge({ movement }: { movement: number | null }) {
  if (movement === null) return <span className="text-xs text-muted-foreground">—</span>;
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
    return <span className="text-xs text-muted-foreground">Not ranked / never checked</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-foreground">#{item.latest_position}</span>
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
  const { site } = useMarketingSite();
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
      toast.error(`${mode.label} needs a location (e.g. "Los Angeles, California, United States")`);
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        keyword: trimmed,
        provider: mode.provider,
        engine: mode.engine ?? undefined,
        search_type: mode.search_type,
        location_name: mode.location === "none" ? undefined : locationName.trim() || undefined,
        cadence_days: cadenceDays,
      });
      setKeyword("");
      setLocationName("");
      toast.success(`Tracking "${trimmed}"`);
    } catch (err) {
      toast.error("Could not add rank target", { description: extractErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[1fr_140px_1fr_100px_auto] md:items-end">
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {mode.search_type === "ai_answer" ? "Prompt to track" : "Keyword"}
        </span>
        {/* The canonical keyword input — Enter still submits unless the
            suggestion dropdown consumed the keypress. */}
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.defaultPrevented) void submit();
          }}
        >
          <KeywordInput
            value={keyword}
            onChange={setKeyword}
            scope={{ siteId: site.id, brandId: site.brand_id }}
            placeholder="e.g. botox cost"
          />
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Track in</span>
        <Select value={modeId} onValueChange={setModeId}>
          <SelectTrigger title={mode.hint}>
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
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {mode.search_type === "ai_answer" ? "City" : "Location"}{" "}
          {mode.location === "required" ? "(required)" : mode.location === "optional" ? "(optional)" : "(n/a)"}
        </span>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder={mode.search_type === "ai_answer" ? "Los Angeles" : "Los Angeles, California, United States"}
          disabled={mode.location === "none"}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Cadence (days)</span>
        <Input
          type="number"
          min={1}
          max={90}
          value={cadenceDays}
          onChange={(e) => setCadenceDays(Number(e.target.value) || 7)}
        />
      </div>
      <Button size="sm" className="h-9 gap-1.5" disabled={!keyword.trim() || submitting} onClick={() => void submit()}>
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Track
      </Button>
    </div>
  );
}

function HistoryDialog({
  targetId,
  keyword,
  siteDomain,
  onClose,
}: {
  targetId: string;
  keyword: string;
  siteDomain: string;
  onClose: () => void;
}) {
  const { points, landscape, loading, error } = useRankTargetHistory(targetId);
  const [showAllLandscape, setShowAllLandscape] = useState(false);
  const location = `Marketing — Rank history for "${keyword}" (${siteDomain})`;
  const landscapeResults = landscape?.results ?? [];
  const visibleLandscape = showAllLandscape
    ? landscapeResults
    : landscapeResults.slice(0, 30);

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
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                        No observations yet — run a check.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...points].reverse().map((point) => (
                      <TableRow key={point.observed_at}>
                        <TableCell className="text-xs">{formatDate(point.observed_at)}</TableCell>
                        <TableCell className="text-xs">
                          {point.organic_rank === null ? "not ranked" : `#${point.organic_rank}`}
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
                    Competitive SERP landscape ({formatDate(landscape.observed_at)})
                  </p>
                  {landscapeResults.length > 30 ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => setShowAllLandscape((current) => !current)}
                    >
                      {showAllLandscape ? "top 30" : `all ${landscapeResults.length}`}
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
                        <TableRow key={result.absolute_rank} className="group/serp">
                          <TableCell className="text-xs">{result.absolute_rank}</TableCell>
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

export function RanksWorkspace() {
  const { site } = useMarketingSite();
  const openKeywordWindow = useOpenKeywordWindow();
  const { items, loading, error, reload, addTarget, updateTarget, removeTarget } =
    usePortfolio(site.id);
  const [historyTarget, setHistoryTarget] = useState<RankPortfolioItem | null>(
    null,
  );

  // A completed live check lands its fresh row on the run's stream event —
  // reload the whole portfolio so position/movement/best-position stay
  // consistent with the same single source of truth used everywhere else.
  const { checking, run } = useRunRankCheck(() => void reload());

  const rows = items;
  const pageLocation = `Marketing — Rank portfolio for ${site.domain}`;

  if (loading && rows.length === 0) {
    return <LoadingSurface label="Loading rank portfolio…" />;
  }
  if (error) {
    return <QueryError error={new Error(error)} onRetry={() => void reload()} />;
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

  return (
    <div className="grid gap-4 p-4">
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
                      rows.map(
                        projectRankPortfolioItem,
                      ) as unknown as Array<Record<string, unknown>>,
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Provider</TableHead>
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
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground">
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
                      <TableCell className="text-xs capitalize">{item.provider}</TableCell>
                      <TableCell>
                        <PositionCell item={item} />
                      </TableCell>
                      <TableCell>
                        <MovementBadge movement={item.movement} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.best_position === null ? "—" : `#${item.best_position}`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.group ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={async (checked) => {
                            try {
                              await updateTarget(item.target_id, { is_active: checked });
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
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            aria-label="Keyword Intelligence"
                            title="Keyword Intelligence"
                            onClick={(event) => {
                              event.stopPropagation();
                              openKeywordWindow({
                                phrase: item.keyword,
                                siteId: site.id,
                                brandId: site.brand_id ?? undefined,
                              });
                            }}
                          >
                            <BrainCircuit className="h-3.5 w-3.5" />
                          </Button>
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
                                provider: item.provider,
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
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}
    </div>
  );
}
