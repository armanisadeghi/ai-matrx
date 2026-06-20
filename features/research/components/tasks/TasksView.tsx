"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  FileWarning,
  Hand,
  Link2Off,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  MousePointerClick,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTopicId } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import { PasteContentModal } from "../sources/PasteContentModal";
import type {
  CaptureLevel,
  ExtensionScrapeItem,
  ExtensionScrapeQueue,
  UserVerdict,
} from "../../types";

// ============================================================================
// Capture-ladder metadata
// ============================================================================

interface LevelMeta {
  title: string;
  short: string;
  blurb: string;
  icon: typeof Zap;
  accent: string;
  badge: string;
  /** True when the user is expected to act on rows in this bucket from the dashboard. */
  userActionable: boolean;
}

const LEVEL_META: Record<CaptureLevel, LevelMeta> = {
  1: {
    title: "Level 1 — Quick scrape",
    short: "Quick",
    blurb:
      "New or untried sources. The extension will batch these on its next run with a quick capture (no wait, no scroll).",
    icon: Zap,
    accent: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    userActionable: false,
  },
  2: {
    title: "Level 2 — Wait & scroll",
    short: "Scroll",
    blurb:
      "Quick scrape returned thin content. The extension will retry with a full page load + auto-scroll for lazy content.",
    icon: MousePointerClick,
    accent: "text-violet-600 dark:text-violet-400",
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    userActionable: false,
  },
  3: {
    title: "Level 3 — User-gated",
    short: "Manual trigger",
    blurb:
      "Auto capture has failed twice. Open each page in your browser, get past any login, paywall, or click-through, then trigger the extension to capture.",
    icon: MousePointerClick,
    accent: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    userActionable: true,
  },
  4: {
    title: "Level 4 — Paste",
    short: "Paste",
    blurb:
      "Every automated tier has failed. Paste the content here yourself, or mark the source complete if the page genuinely has no more content (e.g. a sparse listing).",
    icon: Hand,
    accent: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    userActionable: true,
  },
};

const LEVEL_KEYS: CaptureLevel[] = [1, 2, 3, 4];

const LEVEL_BUCKET_FIELD: Record<
  CaptureLevel,
  keyof Pick<
    ExtensionScrapeQueue,
    "level_1_quick" | "level_2_scroll" | "level_3_user_gated" | "level_4_paste"
  >
> = {
  1: "level_1_quick",
  2: "level_2_scroll",
  3: "level_3_user_gated",
  4: "level_4_paste",
};

// ============================================================================
// Verdict metadata — the optional escape hatch the user can apply to any row
// ============================================================================
//
// Verdicts are NOT required. The auto-pipeline keeps escalating sources up
// the capture ladder until something works or they end up in level_4_paste.
// Verdicts let the user end the cycle on their own terms when they know
// something the system can't infer (page is genuinely sparse, page is dead,
// last capture was junk and they want a clean retry).

interface VerdictMeta {
  label: string;
  toastTitle: string;
  description: string;
  icon: typeof CheckCircle2;
  accent: string;
}

/** Display order in the dropdown (most common first). */
const VERDICT_ORDER: UserVerdict[] = [
  "accept_as_is",
  "gated",
  "dead_link",
  "content_mismatch",
  "ignored",
  "retry",
];

const VERDICT_META: Record<UserVerdict, VerdictMeta> = {
  accept_as_is: {
    label: "Accept as-is",
    toastTitle: "Accepted as the whole page",
    description:
      "This sparse content IS the whole page. Marks the source complete.",
    icon: CheckCircle2,
    accent: "text-green-600 dark:text-green-400",
  },
  gated: {
    label: "Page is gated (login/paywall)",
    toastTitle: "Marked as gated",
    description:
      "Page exists but is behind a login wall, paywall, or captcha we can't practically defeat. Removed from queue (admin can requeue later).",
    icon: Lock,
    accent: "text-orange-600 dark:text-orange-400",
  },
  dead_link: {
    label: "Mark dead link",
    toastTitle: "Marked as dead link",
    description:
      "Page is 404, removed, or domain is dead. Removed from queue forever.",
    icon: Link2Off,
    accent: "text-zinc-500 dark:text-zinc-400",
  },
  content_mismatch: {
    label: "Wrong content",
    toastTitle: "Marked as wrong content",
    description:
      "Page loaded but isn't what this source claimed (redirect, wrong article, etc.). Removed from queue.",
    icon: FileWarning,
    accent: "text-fuchsia-700 dark:text-fuchsia-400",
  },
  ignored: {
    label: "Ignore source",
    toastTitle: "Source ignored",
    description:
      "Not useful for this topic — not dead or gated, just not wanted. Removed from queue.",
    icon: Hand,
    accent: "text-slate-600 dark:text-slate-400",
  },
  retry: {
    label: "Retry from scratch",
    toastTitle: "Queued for retry",
    description:
      "Throw away the last result and re-queue. Next attempt uses the next escalation level.",
    icon: RotateCcw,
    accent: "text-blue-600 dark:text-blue-400",
  },
  // Legacy alias — never shown in UI, but kept in the map so we can still
  // show a sensible toast if the older mark-complete code path is exercised.
  mark_complete: {
    label: "Mark complete",
    toastTitle: "Marked complete",
    description: "Marks the source complete (legacy alias for accept-as-is).",
    icon: CheckCircle2,
    accent: "text-green-600 dark:text-green-400",
  },
};

// ============================================================================
// Helpers
// ============================================================================

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ============================================================================
// Main view
// ============================================================================

export default function TasksView() {
  const topicId = useTopicId();
  const api = useResearchApi();

  const [queue, setQueue] = useState<ExtensionScrapeQueue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<"topic" | "all">("topic");

  const fetchQueue = useCallback(
    async (signal?: AbortSignal) => {
      const res = await api.getExtensionScrapeQueue(signal);
      const data = (await res.json()) as ExtensionScrapeQueue;
      return data;
    },
    [api],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchQueue(ctrl.signal)
      .then((data) => {
        if (!cancelled) setQueue(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [fetchQueue]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchQueue();
      setQueue(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [fetchQueue]);

  const handleVerdict = useCallback(
    async (item: ExtensionScrapeItem, verdict: UserVerdict) => {
      const meta = VERDICT_META[verdict];
      try {
        await api.applyVerdict(item.topic_id, item.source_id, { verdict });
        toast.success(meta.toastTitle, {
          description: item.title || safeHostname(item.url),
        });
        await refresh();
      } catch (err) {
        toast.error(`Could not apply: ${meta.label}`, {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [api, refresh],
  );

  // Filtered + bucketed view
  const buckets = useMemo(() => {
    if (!queue) return null;
    const filterFn = (items: ExtensionScrapeItem[] | undefined) => {
      const list = items ?? [];
      if (scope === "all") return list;
      return list.filter((it) => it.topic_id === topicId);
    };
    return {
      1: filterFn(queue.level_1_quick),
      2: filterFn(queue.level_2_scroll),
      3: filterFn(queue.level_3_user_gated),
      4: filterFn(queue.level_4_paste),
    } satisfies Record<CaptureLevel, ExtensionScrapeItem[]>;
  }, [queue, scope, topicId]);

  const totals = useMemo(() => {
    if (!buckets) return { 1: 0, 2: 0, 3: 0, 4: 0, all: 0 };
    const t = {
      1: buckets[1].length,
      2: buckets[2].length,
      3: buckets[3].length,
      4: buckets[4].length,
    };
    return { ...t, all: t[1] + t[2] + t[3] + t[4] };
  }, [buckets]);

  // Cross-topic counts for the scope toggle hint
  const allTopicsTotal = useMemo(() => {
    if (!queue) return 0;
    return (
      (queue.level_1_quick?.length ?? 0) +
      (queue.level_2_scroll?.length ?? 0) +
      (queue.level_3_user_gated?.length ?? 0) +
      (queue.level_4_paste?.length ?? 0)
    );
  }, [queue]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Capture Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Sources that need help to capture content. The Chrome extension
            handles Levels 1 and 2 automatically; Levels 3 and 4 need you in the
            loop. You can always end the cycle for any source by accepting it
            as-is, marking it a dead link, or asking for a retry — verdicts are
            optional, the auto-pipeline keeps going if you ignore them.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <Switch
              checked={scope === "all"}
              onCheckedChange={(v) => setScope(v ? "all" : "topic")}
              aria-label="Show tasks across all topics"
            />
            <span>All topics ({allTopicsTotal})</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading || refreshing}
            className="gap-1.5"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && !queue ? (
        <TasksLoading />
      ) : !buckets ? null : totals.all === 0 ? (
        <EmptyQueueState scope={scope} />
      ) : (
        <>
          <SummaryStrip totals={totals} />
          <div className="space-y-4">
            {LEVEL_KEYS.map((level) => (
              <LevelSection
                key={level}
                level={level}
                items={buckets[level]}
                scope={scope}
                onVerdict={handleVerdict}
                onAfterPaste={refresh}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function SummaryStrip({
  totals,
}: {
  totals: Record<CaptureLevel, number> & { all: number };
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {LEVEL_KEYS.map((level) => {
        const meta = LEVEL_META[level];
        const Icon = meta.icon;
        const count = totals[level];
        return (
          <div
            key={level}
            className={cn(
              "rounded-lg border bg-card/50 p-3 flex items-center gap-3",
              count === 0 && "opacity-60",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", meta.accent)} />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Level {level} · {meta.short}
              </div>
              <div className="text-lg font-semibold leading-none mt-0.5">
                {count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyQueueState({ scope }: { scope: "topic" | "all" }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
      <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 dark:text-green-400" />
      <h3 className="mt-3 text-base font-semibold">Nothing in the queue</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {scope === "all"
          ? "Every source in every topic has been captured or marked complete."
          : 'Every source in this topic has been captured or marked complete. Switch to "All topics" to see queued work in your other topics.'}
      </p>
    </div>
  );
}

function LevelSection({
  level,
  items,
  scope,
  onVerdict,
  onAfterPaste,
}: {
  level: CaptureLevel;
  items: ExtensionScrapeItem[];
  scope: "topic" | "all";
  onVerdict: (item: ExtensionScrapeItem, verdict: UserVerdict) => Promise<void>;
  onAfterPaste: () => Promise<void>;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  const count = items.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-4 py-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.accent)} />
            <div className="min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                {meta.title}
                <Badge
                  variant="secondary"
                  className={cn("text-[10px] px-1.5 py-0 h-5", meta.badge)}
                >
                  {count}
                </Badge>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {meta.blurb}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      {count === 0 ? (
        <CardContent className="px-4 py-6 text-center text-xs text-muted-foreground">
          No sources at this tier.
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <ul className="divide-y divide-border/50">
            {items.map((item) => (
              <TaskRow
                key={item.source_id}
                item={item}
                scope={scope}
                onVerdict={onVerdict}
                onAfterPaste={onAfterPaste}
              />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function TaskRow({
  item,
  scope,
  onVerdict,
  onAfterPaste,
}: {
  item: ExtensionScrapeItem;
  scope: "topic" | "all";
  onVerdict: (item: ExtensionScrapeItem, verdict: UserVerdict) => Promise<void>;
  onAfterPaste: () => Promise<void>;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pendingVerdict, setPendingVerdict] = useState<UserVerdict | null>(
    null,
  );
  const isPasteLevel = item.next_level === 4;
  const lastAttempt = formatRelative(item.last_attempt_at);
  const host = safeHostname(item.url);

  const handleVerdictClick = async (verdict: UserVerdict) => {
    setPendingVerdict(verdict);
    try {
      await onVerdict(item, verdict);
    } finally {
      setPendingVerdict(null);
    }
  };

  return (
    <li className="px-4 py-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/research/topics/${item.topic_id}/sources/${item.source_id}`}
              className="text-sm font-medium hover:underline truncate max-w-[40ch]"
              title={item.title || item.url}
            >
              {item.title || host}
            </Link>
            {scope === "all" && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 font-normal"
                title={`Topic: ${item.topic_name}`}
              >
                {item.topic_name}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="truncate max-w-[50ch]" title={item.url}>
              {host}
            </span>
            {lastAttempt && (
              <>
                <span aria-hidden>·</span>
                <span>Tried {lastAttempt}</span>
              </>
            )}
            {typeof item.last_char_count === "number" &&
              item.last_char_count > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{item.last_char_count.toLocaleString()} chars</span>
                </>
              )}
          </div>

          {(item.attempted_levels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                Attempted:
              </span>
              {item.attempted_levels?.map((lvl) => {
                const m = LEVEL_META[lvl as CaptureLevel];
                return (
                  <Badge
                    key={lvl}
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 font-normal",
                      m.badge,
                    )}
                    title={m.title}
                  >
                    L{lvl}
                  </Badge>
                );
              })}
            </div>
          )}

          {item.last_failure_reason && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <FileWarning className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="font-mono break-all">
                {item.last_failure_reason}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-start gap-1.5 shrink-0">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
          >
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </Button>
          {isPasteLevel && (
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setPasteOpen(true)}
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={pendingVerdict !== null}
              >
                {pendingVerdict !== null ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Resolve
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                End the cycle for this source
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {VERDICT_ORDER.map((verdict) => {
                const meta = VERDICT_META[verdict];
                const Icon = meta.icon;
                return (
                  <DropdownMenuItem
                    key={verdict}
                    onSelect={() => handleVerdictClick(verdict)}
                    className="gap-2 items-start py-2"
                  >
                    <Icon
                      className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", meta.accent)}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{meta.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">
                        {meta.description}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isPasteLevel && (
        <PasteContentModal
          open={pasteOpen}
          onOpenChange={setPasteOpen}
          topicId={item.topic_id}
          sourceId={item.source_id}
          onSaved={async () => {
            setPasteOpen(false);
            toast.success("Content saved", {
              description: item.title || host,
            });
            await onAfterPaste();
          }}
        />
      )}
    </li>
  );
}

function TasksLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}
