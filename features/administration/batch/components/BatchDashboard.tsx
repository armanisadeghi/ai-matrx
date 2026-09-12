"use client";

/**
 * features/administration/batch/components/BatchDashboard.tsx
 *
 * `/administration/knowledge/batch` — per-item visibility for the platform
 * Batch system (matrx-batch: background AI work run through provider Batch
 * APIs at ~50% price).
 *
 * THE ONE THING THIS SCREEN EXISTS FOR: a work item can be `completed` —
 * the answer came back, the tokens were paid for — while `handler_status`
 * is `dead`, meaning that answer was never delivered to the consumer that
 * ordered it. That is money spent for nothing, and until this page existed
 * there was no surface anywhere that showed it. It is therefore an alert
 * band at the top, not a number in a row.
 *
 * Modelled on Stripe's payments dashboard (a money-truth band over a dense,
 * filterable ledger) and Linear's issue list (chip filters, quiet rows,
 * expand in place). Reads go straight to Supabase under RLS; the tables are
 * `ledger` — the server writes, admins read.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  PiggyBank,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@ai-matrx/design-system";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AppLink } from "@/components/navigation/AppLink";
import {
  fetchQueueState,
  fetchSavings,
  listProviderBatches,
  type ProviderBatch,
  type QueueState,
  type SavingsRollup,
  type SavingsWindow,
  WORK_ITEM_STATUSES,
  HANDLER_STATUSES,
} from "../service/batchAdminService";
import { DELIVERY, fmtInt, fmtPct, fmtUsd } from "./presentation";
import { WorkItemsPanel } from "./WorkItemsPanel";
import { ProviderBatchesPanel } from "./ProviderBatchesPanel";

const WINDOWS: { key: SavingsWindow; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

// ---------------------------------------------------------------------------
// The alarm
// ---------------------------------------------------------------------------

function UndeliveredBand({
  count,
  wastedUsd,
  windowLabel,
  onShow,
  loading,
}: {
  count: number;
  wastedUsd: number;
  windowLabel: string;
  onShow: () => void;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-16 w-full rounded-lg" />;

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        Every answer that came back was delivered to the consumer that ordered it.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">
          {count === 1
            ? "1 answer came back and was never delivered"
            : `${fmtInt(count)} answers came back and were never delivered`}
        </p>
        <p className="mt-0.5 text-xs text-destructive/90">
          The provider returned a result and we were billed for it, but every
          delivery attempt failed and the item was dead-lettered. Nothing
          downstream ever received these answers.
          {wastedUsd > 0 ? (
            <>
              {" "}
              <span className="font-mono">{fmtUsd(wastedUsd)}</span> spent this
              way in the last {windowLabel.toLowerCase()}.
            </>
          ) : null}
        </p>
      </div>
      <Button size="sm" variant="destructive" onClick={onShow}>
        Show these items
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Savings, honestly
// ---------------------------------------------------------------------------

function SavingsBand({
  savings,
  loading,
  window,
  onWindowChange,
}: {
  savings: SavingsRollup | null;
  loading: boolean;
  window: SavingsWindow;
  onWindowChange: (w: SavingsWindow) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Savings</h2>
          <span className="text-xs text-muted-foreground">
            {loading || !savings
              ? "measuring…"
              : `across ${fmtInt(savings.items)} completed ${savings.items === 1 ? "item" : "items"}`}
          </span>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => onWindowChange(w.key)}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                window === w.key
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {loading || !savings ? (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : savings.items === 0 ? (
        <p className="px-4 py-5 text-xs text-muted-foreground">
          No work completed in this window, so there is nothing to compare. The
          batch queue is idle most of the time — this is its resting state, not
          a failure.
        </p>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Saved vs live pricing"
            value={fmtUsd(savings.savedUsd)}
            sub={
              savings.savedPct === null
                ? "no live-cost estimate recorded"
                : `${fmtPct(savings.savedPct)} off the live price`
            }
            emphasis="success"
          />
          <Figure
            label="Actually billed"
            value={fmtUsd(savings.actualUsd)}
            sub="what the provider charged through the Batch API"
          />
          <Figure
            label="Live-equivalent"
            value={fmtUsd(savings.estLiveUsd)}
            sub="what the same work would have cost instantly"
          />
          <Figure
            label="Cached input tokens"
            value={
              savings.cacheReadTokens > 0
                ? fmtInt(savings.cacheReadTokens)
                : "none recorded"
            }
            sub={
              savings.cacheReadTokens > 0
                ? `${fmtPct(savings.cacheReadPct, 1)} of input tokens served from a prefix cache`
                : "no provider reported a cache read in this window"
            }
            muted={savings.cacheReadTokens === 0}
          />
        </div>
      )}

      {savings && savings.undeliveredItems > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-destructive">
          {fmtUsd(savings.undeliveredUsd)} of that spend bought answers that
          were never delivered ({fmtInt(savings.undeliveredItems)}{" "}
          {savings.undeliveredItems === 1 ? "item" : "items"}). A discount on
          work nobody received is not a saving.
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  sub,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: "success";
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          emphasis === "success" ? "text-success" : "text-foreground",
          muted && "text-base font-normal text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue state at a glance — chips that are also the filter
// ---------------------------------------------------------------------------

function Chip({
  label,
  count,
  active,
  tone,
  title,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "danger";
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        count === 0
          ? "border-border bg-transparent text-muted-foreground/70"
          : "border-border bg-card text-foreground hover:bg-accent",
        tone === "danger" && count > 0 &&
          "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums font-semibold">{count}</span>
    </button>
  );
}

function QueueStateStrip({
  queue,
  loading,
  statusFilter,
  handlerFilter,
  onStatus,
  onHandler,
}: {
  queue: QueueState | null;
  loading: boolean;
  statusFilter: string | null;
  handlerFilter: string | null;
  onStatus: (s: string | null) => void;
  onHandler: (h: string | null) => void;
}) {
  if (loading || !queue) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Queue</h2>
        <span className="text-xs text-muted-foreground">
          {fmtInt(queue.total)} work {queue.total === 1 ? "item" : "items"} ever
          enqueued
        </span>
      </header>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            Lifecycle
          </span>
          {WORK_ITEM_STATUSES.map((s) => (
            <Chip
              key={s}
              label={s}
              count={queue.byStatus[s] ?? 0}
              active={statusFilter === s}
              tone={s === "dead_letter" ? "danger" : undefined}
              onClick={() => onStatus(statusFilter === s ? null : s)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            Delivery
          </span>
          {HANDLER_STATUSES.map((h) => (
            <Chip
              key={h}
              label={DELIVERY[h]?.label ?? h}
              count={queue.byHandler[h] ?? 0}
              active={handlerFilter === h}
              tone={h === "dead" ? "danger" : undefined}
              title={DELIVERY[h]?.hint}
              onClick={() => onHandler(handlerFilter === h ? null : h)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BatchDashboard() {
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [savings, setSavings] = useState<SavingsRollup | null>(null);
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [savingsWindow, setSavingsWindow] = useState<SavingsWindow>("30d");

  const [providerBatches, setProviderBatches] = useState<ProviderBatch[] | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [handlerFilter, setHandlerFilter] = useState<string | null>(null);
  /** Items tab narrowed to one provider submission (set from a batch row). */
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  /** Batches tab opened on one submission (set from an item's detail). */
  const [focusBatchId, setFocusBatchId] = useState<string | null>(null);
  const [tab, setTab] = useState("items");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setQueueLoading(true);
    setQueueError(null);
    fetchQueueState({ signal: controller.signal })
      .then(setQueue)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setQueueError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueueLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    setSavingsLoading(true);
    setSavingsError(null);
    fetchSavings(savingsWindow, { signal: controller.signal })
      .then(setSavings)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setSavingsError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSavingsLoading(false);
      });
    return () => controller.abort();
  }, [savingsWindow, refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    setProviderLoading(true);
    setProviderError(null);
    listProviderBatches({ signal: controller.signal })
      .then(setProviderBatches)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setProviderError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProviderLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  const showUndelivered = useCallback(() => {
    setStatusFilter("completed");
    setHandlerFilter("dead");
    setBatchFilter(null);
    setTab("items");
  }, []);

  const openBatch = useCallback((id: string) => {
    setFocusBatchId(id);
    setTab("batches");
  }, []);

  const showBatchItems = useCallback((id: string) => {
    setStatusFilter(null);
    setHandlerFilter(null);
    setBatchFilter(id);
    setTab("items");
  }, []);

  const windowLabel = useMemo(
    () => WINDOWS.find((w) => w.key === savingsWindow)?.label ?? "",
    [savingsWindow],
  );

  const refreshing = queueLoading || savingsLoading || providerLoading;

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 pr-14">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ServerCog className="h-4 w-4 text-muted-foreground" />
            Batch
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Background AI work run through provider Batch APIs at roughly half
            price — every item, every submission, and what actually reached its
            consumer.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AppLink
            href="/administration/knowledge/kg-cost"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            KG Cost
          </AppLink>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {(queueError || savingsError || providerError) && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              <p className="font-semibold">The batch data could not be read.</p>
              <p className="mt-1 font-mono">
                {queueError ?? savingsError ?? providerError}
              </p>
              <p className="mt-1">
                Nothing on this screen below is complete while that stands. Use
                Refresh once the cause is cleared.
              </p>
            </div>
          )}

          <UndeliveredBand
            count={queue?.undelivered ?? 0}
            wastedUsd={savings?.undeliveredUsd ?? 0}
            windowLabel={windowLabel}
            onShow={showUndelivered}
            loading={queueLoading}
          />

          <QueueStateStrip
            queue={queue}
            loading={queueLoading}
            statusFilter={statusFilter}
            handlerFilter={handlerFilter}
            onStatus={(s) => {
              setStatusFilter(s);
              setTab("items");
            }}
            onHandler={(h) => {
              setHandlerFilter(h);
              setTab("items");
            }}
          />

          <SavingsBand
            savings={savings}
            loading={savingsLoading}
            window={savingsWindow}
            onWindowChange={setSavingsWindow}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="items">Work items</TabsTrigger>
              <TabsTrigger value="batches">
                Provider batches
                {providerBatches ? (
                  <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                    {providerBatches.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="mt-3">
              <WorkItemsPanel
                statusFilter={statusFilter}
                handlerFilter={handlerFilter}
                onStatusFilter={setStatusFilter}
                onHandlerFilter={setHandlerFilter}
                batchFilter={batchFilter}
                onBatchFilter={setBatchFilter}
                onOpenBatch={openBatch}
                refreshTick={refreshTick}
              />
            </TabsContent>

            <TabsContent value="batches" className="mt-3">
              <ProviderBatchesPanel
                batches={providerBatches}
                loading={providerLoading}
                error={providerError}
                focusId={focusBatchId}
                onShowItems={showBatchItems}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
