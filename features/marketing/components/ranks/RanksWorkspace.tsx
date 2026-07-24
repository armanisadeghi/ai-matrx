"use client";

/**
 * Rank tracking workspace (WS-10 / M-34..M-37) — the site's rank portfolio:
 * add/remove/group tracked keywords, per-target position + movement + best
 * position, a one-shot live check button, and a history drill-in (chart +
 * table + competitive SERP landscape).
 */

import { useState } from "react";
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
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { RankSparkline } from "./RankSparkline";
import { usePortfolio, useRankTargetHistory, useRunRankCheck } from "./useRanks";
import type { RankPortfolioItem, RankProvider } from "./types";

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
  }) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [provider, setProvider] = useState<RankProvider>("brave");
  const [locationName, setLocationName] = useState("");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (provider === "serpapi" && !locationName.trim()) {
      toast.error("SerpAPI rank targets need a location (e.g. \"Los Angeles, California, United States\")");
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        keyword: trimmed,
        provider,
        location_name: locationName.trim() || undefined,
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
        <span className="text-[11px] font-medium text-muted-foreground">Keyword</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. botox cost"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Provider</span>
        <Select value={provider} onValueChange={(v) => setProvider(v as RankProvider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="brave">Brave</SelectItem>
            <SelectItem value="serpapi">Google (SerpAPI)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Location {provider === "serpapi" ? "(required)" : "(SerpAPI only)"}
        </span>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="Los Angeles, California, United States"
          disabled={provider !== "serpapi"}
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

function HistoryDialog({ targetId, onClose }: { targetId: string; onClose: () => void }) {
  const { points, landscape, loading, error } = useRankTargetHistory(targetId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Position history</DialogTitle>
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
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Competitive SERP landscape ({formatDate(landscape.observed_at)})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Title</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {landscape.results.slice(0, 30).map((result) => (
                        <TableRow key={result.absolute_rank}>
                          <TableCell className="text-xs">{result.absolute_rank}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs">
                            {result.domain ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                            {result.title ?? result.url ?? "—"}
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
  const { items, loading, error, reload, addTarget, updateTarget, removeTarget } =
    usePortfolio(site.id);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);

  // A completed live check lands its fresh row on the run's stream event —
  // reload the whole portfolio so position/movement/best-position stay
  // consistent with the same single source of truth used everywhere else.
  const { checking, run } = useRunRankCheck(() => void reload());

  const rows = items;

  if (loading && rows.length === 0) {
    return <LoadingSurface label="Loading rank portfolio…" />;
  }
  if (error) {
    return <QueryError error={new Error(error)} onRetry={() => void reload()} />;
  }

  return (
    <div className="grid gap-4 p-4">
      <SectionCard
        title="Rank portfolio"
        headerExtra={
          <button
            type="button"
            onClick={() => void reload()}
            className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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
                          onClick={() => setHistoryTargetId(item.target_id)}
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
      {historyTargetId ? (
        <HistoryDialog targetId={historyTargetId} onClose={() => setHistoryTargetId(null)} />
      ) : null}
    </div>
  );
}
