"use client";

// features/scraper/batch/BatchScrapePage.tsx
//
// THE BATCH SCRAPE SURFACE (2026-09-17) — the door a non-technical person was
// missing. The scraper engine could already take many URLs at once
// (`POST /api/scraper/quick-scrape` takes `urls: list[str]` and streams one
// envelope per page); nothing on screen let a person reach that. `/scraper/quick`
// takes one URL, `/scraper/search-and-scrape` is keyword search. This is the
// third door: paste a pile of links, press one button, watch honest per-URL
// results land in a table, retry a failure in place, select the good ones and
// send them onward.
//
// REUSED, not re-invented:
//   - `useScraperApi().scrapeUrlsBatch` — added to the shared hook alongside
//     this surface. ONE request, the backend's own streaming shape; a bad row
//     never aborts the batch (unlike `scrapeUrls`, which throws on the first
//     failed row and loses every other result — wrong for a table that must
//     show 200 honest outcomes).
//   - `<ScrapeProvenance>` — which engine, whether it escalated, in words.
//   - `<ScrapeFailureNotice>` machinery is NOT reused verbatim here (it is a
//     single big alert for a single scrape); the per-row failure sentence
//     comes from the same `classifyScrapeFailure` plain-words law via
//     `BatchScrapeRow.failureMessage`, which is never a stack trace or JSON.
//   - `MatrxDataTable` + its `selection` config — the canonical table +
//     bulk-selection primitive (`lib/entity-list`'s bulk bar is built on this
//     same contract). `EntityListPage` itself does not fit: every config it
//     ships requires a server-side scoped-list RPC ("the service triple") for
//     a persisted entity, and these rows are an ephemeral in-memory scrape
//     run with no table behind them — forcing one would mean inventing a fake
//     backing service for rows that are never stored.
//   - `parseUrlList` (`features/scraper/batch/parseUrlList.ts`) — the paste
//     reader, already written for this surface.
//
// THE CAPTURE LADDER (2026-09-17, CONTRACT.md §8.2): this screen gained a
// **Rung** column and a **Send the rest to my browser** action. A page that our
// server cannot read is not a dead row any more — it is a row the server has
// already decided the person's own logged-in Chrome could read, and the button
// queues exactly those. The selection rule is NOT this file's: it is
// `stoppedAtOwnBrowser` / `selectOwnBrowserUrls`, which refuse any row the
// server did not mark `next_rung === "own_browser"`, because inferring the next
// rung on the client is how a rung gets skipped.
//
// SOURCES (SOURCE-CONVERGENCE §4.1, 2026-09-25): every page this screen reads
// already LANDED as a Source at the scrape route's result boundary — the
// server's page payload carries its `processed_document_id` and any notices
// the door raised. So the bulk action is no longer "copy into Notes" (the old
// stopgap, deleted): it is Save — the ONE Save panel
// (`features/sources/SaveSourcePanel.tsx`, §8.3), where the person picks where
// each Source is filed; the panel sends `POST /sources/{id}/keep`, the signal
// that starts the Source's AI processing. Screen copy says "Save" (plan §8).
// Each row shows its Source and opens it. A row that did not land
// says why (the door's own sentence), never a silent gap.

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import {
  sourceHref,
  type LandedSource,
} from "@/features/sources/api/sourcesApi";
import { SaveSourcePanel } from "@/features/sources/SaveSourcePanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  ExternalLink,
  Bookmark,
  MonitorSmartphone,
} from "lucide-react";
import {
  useScraperApi,
  type BatchScrapeRow,
} from "@/features/scraper/hooks/useScraperApi";
import { ScrapeProvenance } from "@/features/scraper/parts/ScrapeProvenance";
import {
  parseUrlList,
  describeParsedUrlList,
  BATCH_URL_CAP,
} from "@/features/scraper/batch/parseUrlList";
import {
  describeRung,
  stoppedAtOwnBrowser,
  type LadderCandidate,
} from "@/features/capture-ladder/ladderOutcome";
import { sendUrlsToOwnBrowser } from "@/features/capture-ladder/sendToOwnBrowser";
import { NEEDS_YOU_ROUTE } from "@/features/capture-ladder/route";

type RowStatus = "pending" | "success" | "failed";

/**
 * `LadderCandidate` is structural on purpose — a row only has to expose `url`
 * and `ladder` for the ladder's own selection rule to judge it, and this table
 * satisfying that interface is what lets the rule live in one place instead of
 * being re-typed here as a filter over `result`.
 */
interface BatchRow extends LadderCandidate {
  url: string;
  status: RowStatus;
  result: BatchScrapeRow["result"];
  failureMessage: string | null;
  /** The Source this page landed as; null when it did not land (see `sourceNotices`). */
  processedDocumentId: string | null;
  sourceNotices: BatchScrapeRow["sourceNotices"];
  /** True once the person kept this Source from this screen. */
  kept: boolean;
}

function toPending(url: string): BatchRow {
  return {
    url,
    status: "pending",
    result: null,
    failureMessage: null,
    ladder: null,
    processedDocumentId: null,
    sourceNotices: [],
    kept: false,
  };
}

function fromBatchRow(row: BatchScrapeRow): BatchRow {
  return {
    url: row.url,
    status: row.success ? "success" : "failed",
    result: row.result,
    failureMessage: row.failureMessage,
    // The server's verdict, carried verbatim. `null` when it did not give one.
    ladder: row.result?.ladder ?? null,
    processedDocumentId: row.processedDocumentId,
    sourceNotices: row.sourceNotices,
    kept: false,
  };
}

function wordCount(chars: number | null | undefined): number | null {
  if (!chars) return null;
  return Math.round(chars / 5.5);
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "pending") {
    return (
      <Badge variant="neutral" className="gap-1 text-[11px] font-normal">
        <Clock className="h-3 w-3 animate-pulse" aria-hidden="true" />
        Waiting
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge
        variant="neutral"
        className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[11px] font-normal text-emerald-700 dark:text-emerald-400"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Read
      </Badge>
    );
  }
  return (
    <Badge
      variant="neutral"
      className="gap-1 border-destructive/30 bg-destructive/10 text-[11px] font-normal text-destructive"
    >
      <XCircle className="h-3 w-3" aria-hidden="true" />
      Failed
    </Badge>
  );
}

export default function BatchScrapePage() {
  const { scrapeUrlsBatch, isLoading } = useScraperApi();
  const organizationId = useAppSelector(selectOrganizationId);

  const [text, setText] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** The rows the Save panel is open for; null when it is closed. */
  const [saveRows, setSaveRows] = useState<BatchRow[] | null>(null);
  const [sendingToBrowser, setSendingToBrowser] = useState(false);

  // Guards a retry's callback against landing after a NEW full run started —
  // the row it would update may no longer exist in `rows` at all.
  const runToken = useRef(0);

  const parsed = useMemo(() => parseUrlList(text), [text]);
  const summary = useMemo(
    () => describeParsedUrlList(parsed, BATCH_URL_CAP),
    [parsed],
  );

  const updateRow = useCallback((next: BatchRow) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.url === next.url);
      if (idx === -1) return prev;
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (parsed.urls.length === 0) return;
    const token = ++runToken.current;
    setHasRun(true);
    setSelectedIds([]);
    setRows(parsed.urls.map(toPending));
    await scrapeUrlsBatch(parsed.urls, (row) => {
      if (runToken.current !== token) return;
      updateRow(fromBatchRow(row));
    });
  }, [parsed.urls, scrapeUrlsBatch, updateRow]);

  const handleRetry = useCallback(
    async (url: string) => {
      const token = runToken.current;
      setRetrying((prev) => new Set(prev).add(url));
      updateRow(toPending(url));
      try {
        await scrapeUrlsBatch(
          [url],
          (row) => {
            if (runToken.current !== token) return;
            updateRow(fromBatchRow(row));
          },
          { use_cache: false },
        );
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      }
    },
    [scrapeUrlsBatch, updateRow],
  );

  /**
   * Save the selected Sources through the ONE Save panel (SOURCE-CONVERGENCE
   * §8.3): the person chooses where each is filed (project, task, scope,
   * research topic, Library…) and the panel sends `POST /sources/{id}/keep`
   * per Source, rendering every refusal and notice. Rows that did not become
   * a Source are said out loud, never silently skipped.
   */
  const openSaveForSelected = useCallback((selectedRows: BatchRow[]) => {
    const readRows = selectedRows.filter((r) => r.status === "success");
    if (readRows.length === 0) {
      toast.error("Select at least one successfully read page first");
      return;
    }
    const notLanded = readRows.filter((r) => !r.processedDocumentId);
    const keepable = readRows.filter((r) => r.processedDocumentId);
    if (keepable.length === 0) {
      toast.error(
        notLanded[0]?.sourceNotices[0]?.message ??
          "None of the selected pages became a Source, so there is nothing to save. Scrape them again.",
      );
      return;
    }
    if (notLanded.length > 0) {
      toast.warning(
        `${notLanded.length} ${notLanded.length === 1 ? "page did" : "pages did"} not become a Source and ${notLanded.length === 1 ? "is" : "are"} left out.`,
      );
    }
    setSaveRows(keepable);
  }, []);

  const handleSaved = useCallback(
    (results: LandedSource[]) => {
      const byId = new Map(results.map((r) => [r.processed_document_id, r]));
      for (const row of saveRows ?? []) {
        const landed = row.processedDocumentId
          ? byId.get(row.processedDocumentId)
          : undefined;
        if (landed)
          updateRow({
            ...row,
            kept: landed.kept,
            sourceNotices: landed.notices ?? row.sourceNotices,
          });
      }
      setSaveRows(null);
      setSelectedIds([]);
    },
    [saveRows, updateRow],
  );

  // Every row the SERVER sent to rung 3. Not "every failure" — a 404 is a 404
  // in anybody's browser, and offering to retry it in the person's own Chrome
  // would be asking them to do something that cannot work.
  const ownBrowserRows = useMemo(
    () => rows.filter(stoppedAtOwnBrowser),
    [rows],
  );

  const handleSendToOwnBrowser = useCallback(async () => {
    setSendingToBrowser(true);
    try {
      await ensureOrganizationContext({ organizationId });
      // Throws rather than return a row the server did not send to rung 3 —
      // deliberately uncaught as a selection bug, caught here only so the
      // person sees the sentence instead of a blank button.
      const outcome = await sendUrlsToOwnBrowser(ownBrowserRows);
      if (outcome.kind === "sent") {
        toast.success(outcome.sentence);
      } else if (outcome.kind === "nothing_to_send") {
        toast.error(outcome.sentence);
      } else {
        // `not_available` and `refused` are both "nothing was queued" — said
        // out loud, never a button that appears to work and does nothing.
        toast.error(outcome.sentence);
      }
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return;
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Nothing was sent to your browser and we could not say why.",
      );
    } finally {
      setSendingToBrowser(false);
    }
  }, [organizationId, ownBrowserRows]);

  const columns: MatrxColumnDef<BatchRow>[] = [
    {
      accessorKey: "url",
      header: "URL",
      sortable: true,
      cell: (row) => (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1 text-sm text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block max-w-[360px] truncate">{row.url}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "size",
      header: "Chars / Words",
      accessorFn: (row) =>
        row.result?.contentChars ?? row.result?.overview.char_count ?? null,
      cell: (row) => {
        const chars =
          row.result?.contentChars ?? row.result?.overview.char_count ?? null;
        if (chars == null)
          return <span className="text-muted-foreground">—</span>;
        const words = wordCount(chars);
        return (
          <span className="text-sm text-muted-foreground">
            {chars.toLocaleString()} chars
            {words != null ? ` · ${words.toLocaleString()} words` : ""}
          </span>
        );
      },
    },
    {
      id: "rung",
      header: "Rung",
      filter: false,
      cell: (row) => {
        if (row.status === "pending") {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const rung = describeRung(row.ladder, row.status === "success");
        // The server said nothing about the ladder. Say nothing — never invent
        // a rung nobody ran. (Every response from before the ladder build, and
        // every response until the aidream ladder half deploys.)
        if (!rung) {
          return (
            <span
              className="text-xs text-muted-foreground"
              title="This server has not told us which step read this page."
            >
              Not said
            </span>
          );
        }
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">
              {rung.reached}
            </span>
            {rung.next ? (
              <span
                className={
                  rung.waitingOnYou
                    ? "text-[11px] text-amber-700 dark:text-amber-400"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {rung.next}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "source",
      header: "Source",
      filter: false,
      cell: (row) => {
        if (row.status !== "success") {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        if (!row.processedDocumentId) {
          return (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {row.sourceNotices[0]?.message ??
                "This page did not become a Source."}
            </span>
          );
        }
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <Link
                href={sourceHref(row.processedDocumentId)}
                className="text-xs font-medium text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open
              </Link>
              {row.kept ? (
                <Badge
                  variant="neutral"
                  className="h-4 px-1 text-[10px] font-normal text-emerald-700 dark:text-emerald-400"
                >
                  Saved
                </Badge>
              ) : null}
            </span>
            <span
              className="font-mono text-[10px] text-muted-foreground"
              title={row.processedDocumentId}
            >
              {row.processedDocumentId.slice(0, 8)}
            </span>
            {row.sourceNotices.map((n) => (
              <span
                key={n.code + n.message}
                className="text-[10px] text-muted-foreground"
              >
                {n.message}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: "notes",
      header: "Engine & Notes",
      filter: false,
      cell: (row) => {
        if (row.status === "pending") {
          return (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading…
            </span>
          );
        }
        if (row.status === "failed") {
          return (
            <span className="text-xs text-destructive">
              {row.failureMessage ?? "We could not read that page."}
            </span>
          );
        }
        return (
          <ScrapeProvenance
            engine={row.result?.engine}
            escalated={row.result?.escalated}
            escalationReason={row.result?.escalationReason}
            escalationNote={row.result?.escalationNote}
            contentWarning={row.result?.contentWarning}
            proxyBypassed={row.result?.proxyBypassed}
          />
        );
      },
    },
  ];

  return (
    <div
      className="h-full flex flex-col overflow-hidden bg-textured"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      {/* Paste box + run control */}
      <div className="flex-shrink-0 border-b border-border/50 px-3 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Paste a list of pages to read
            {/* THE DOOR to the Block Ledger. A page that will not open is a
                finding, not a dead end: it is already recorded, and this is
                where a person goes to see every one of them. */}
            <Link
              href="/acquisition/blocks"
              className="ml-auto text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              See everything that was blocked
            </Link>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "Paste any number of links — one per line, separated by commas, or even copied out of a paragraph. Up to " +
              BATCH_URL_CAP +
              " at a time."
            }
            disabled={isLoading}
            className="min-h-[100px] resize-y text-sm"
            style={{ fontSize: "16px" }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {summary ?? "Paste links above to see what we understood."}
            </p>
            <Button
              onClick={handleRun}
              disabled={isLoading || parsed.urls.length === 0}
              size="sm"
              className="gap-1.5 flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ClipboardList className="h-3.5 w-3.5" />
              )}
              {parsed.urls.length > 0
                ? `Scrape ${parsed.urls.length} page${parsed.urls.length === 1 ? "" : "s"}`
                : "Scrape"}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="mx-auto h-full max-w-5xl">
          {!hasRun ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <ClipboardList className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">
                Paste links above and press Scrape to see per-page results here.
              </p>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-2">
              {/* ABSENT when nothing stopped at the person's own browser — not
                  a greyed button that looks broken. The one honest state for
                  "there is nothing to send" is no control at all. */}
              {ownBrowserRows.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2">
                  <p className="min-w-0 text-xs text-amber-800 dark:text-amber-300">
                    {ownBrowserRows.length === 1
                      ? "1 page would not open for us, but it should open in your own browser — you are already signed in there."
                      : `${ownBrowserRows.length} pages would not open for us, but they should open in your own browser — you are already signed in there.`}
                  </p>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <a
                      href={NEEDS_YOU_ROUTE}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      What is already waiting
                    </a>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={sendingToBrowser}
                      onClick={() => void handleSendToOwnBrowser()}
                    >
                      {sendingToBrowser ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MonitorSmartphone className="h-3.5 w-3.5" />
                      )}
                      Send the rest to my browser
                    </Button>
                  </div>
                </div>
              ) : null}
              <MatrxDataTable<BatchRow>
                tableId="scraper-batch-results"
                data={rows}
                columns={columns}
                getRowId={(row) => row.url}
                isLoading={rows.length === 0 && isLoading}
                isFetching={isLoading}
                viewTabs={false}
                hidePagination={rows.length <= 25}
                density="condensed"
                rowActions={(row) =>
                  row.status === "failed" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={retrying.has(row.url) || isLoading}
                      onClick={() => void handleRetry(row.url)}
                    >
                      {retrying.has(row.url) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCw className="h-3 w-3" />
                      )}
                      Retry
                    </Button>
                  ) : null
                }
                selection={{
                  selectedIds,
                  onSelectedIdsChange: setSelectedIds,
                  isRowSelectable: (row) => row.status === "success",
                  noun: "page",
                  actions: (selected) => (
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => openSaveForSelected(selected)}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      Save selected…
                    </Button>
                  ),
                }}
                emptyState={{
                  title: "No pages yet",
                  description: "Paste links above and press Scrape.",
                }}
              />
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!saveRows} onOpenChange={(o) => !o && setSaveRows(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Save{" "}
              {saveRows?.length === 1
                ? "1 page"
                : `${saveRows?.length ?? 0} pages`}
            </DialogTitle>
          </DialogHeader>
          {saveRows ? (
            <SaveSourcePanel
              embedded
              sources={saveRows.map((r) => ({
                processedDocumentId: r.processedDocumentId as string,
                name: r.result?.overview?.page_title || r.url,
              }))}
              landingNotices={saveRows
                .flatMap((r) => r.sourceNotices)
                .filter(
                  (n, i, all) =>
                    all.findIndex((m) => m.message === n.message) === i,
                )}
              onCancel={() => setSaveRows(null)}
              onSaved={handleSaved}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
