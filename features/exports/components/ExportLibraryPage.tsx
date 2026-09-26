"use client";

// features/exports/components/ExportLibraryPage.tsx
//
// /exports/[libraryId] — ONE dropped export: what it is, what is in it, and
// the one thing worth doing with it.
//
// LAYOUT. The shell header is glass and `.shell-main` is pulled up under it,
// so this body is `h-full overflow-hidden` and never subtracts a header height
// (core-route-headers § banned height math). The summary strip + quick views
// are STATIC top chrome, so they carry the `--shell-header-h` clearance and
// the list below gets `clearsShellHeader={false}` — otherwise the padding
// would be applied twice and the toolbar would sit in dead space.
//
// THE STREAM IS NEVER THE ONLY COPY. Every mount re-reads the Library; the
// index stream is live decoration on top of that read, because indexing keeps
// running after a disconnect and a page that believed only the stream would
// show an empty export after a refresh.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { commitUrlParams, useUrlSearchParams } from "@ai-matrx/kit/url-state";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityBulkActionResult } from "@/lib/entity-list/selection";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { createExportItemsListConfig } from "../browse/listConfig";
import { deriveExportCounts, type ExportPageFacts } from "../counts";
import { fetchExportLibrary, streamExportIndex } from "../api";
import { forgetFreshExport, peekFreshExport } from "../freshExport";
import type { ExportItem, ExportLibrary, ExportSummary } from "../types";
import { ExportsHeader } from "./ExportsHeader";
import { ExportListTotals } from "./ExportListTotals";
import { IDLE_INDEX_STATE, IndexProgress, type IndexState } from "./IndexProgress";
import { LibrarySummary } from "./LibrarySummary";
import { QuickViews } from "./QuickViews";
import {
  SendToRulebookDialog,
  type PendingSend,
} from "./SendToRulebookDialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** The picked-yourself identity, per library, on this device. */
function ownerOverrideKey(libraryId: string): string {
  return `matrx.exports.owner.${libraryId}`;
}

function readOwnerOverride(libraryId: string): string | null {
  try {
    return window.localStorage.getItem(ownerOverrideKey(libraryId));
  } catch {
    return null;
  }
}

/**
 * The Library the previous screen already knows about, if the person arrived
 * straight from the drop zone. A pure read, used as a first render's seed.
 */
function seedLibrary(libraryId: string): ExportLibrary | null {
  const fresh = peekFreshExport(libraryId);
  if (!fresh) return null;
  return {
    ...fresh.library,
    adapter: fresh.detected.adapter,
    adapter_label: fresh.detected.adapter_label,
    detected_from: fresh.detected.detected_from,
  };
}

export function ExportLibraryPage({ libraryId }: { libraryId: string }) {
  // Seeded, never awaited: the server read below replaces this within a tick,
  // and the index keeps running whether or not this page is looking.
  const [library, setLibrary] = useState<ExportLibrary | null>(() =>
    seedLibrary(libraryId),
  );
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [indexState, setIndexState] = useState<IndexState>(IDLE_INDEX_STATE);
  const [ownerOverride, setOwnerOverride] = useState<string | null>(() =>
    readOwnerOverride(libraryId),
  );
  const [facts, setFacts] = useState<ExportPageFacts | null>(null);
  /**
   * The open send, WITH the promise the bulk action is waiting on.
   *
   * The resolver lives in state beside the request rather than in a ref
   * because the bulk action's `run` is handed to the list config, and a
   * callback that closes over a ref cannot be passed into one without reading
   * that ref during render (react-hooks/refs). One object, one lifetime.
   */
  const [openSend, setOpenSend] = useState<{
    pending: PendingSend;
    resolve: (result: EntityBulkActionResult | void) => void;
  } | null>(null);

  const indexAbort = useRef<AbortController | null>(null);

  // The handoff has done its one job; it must not seed a later visit.
  useEffect(() => forgetFreshExport(), [libraryId]);

  // ─── Read the Library, every mount ──────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchExportLibrary(libraryId, controller.signal)
      .then((read) => {
        setLibrary(read);
        if (read.summary) setSummary(read.summary);
        setReadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // NOT a wall: the items endpoint is a separate read and still works,
        // so the list below stays usable and this says exactly what is missing.
        setReadError(extractErrorMessage(error));
      });

    return () => controller.abort();
  }, [libraryId]);

  // ─── Index, and watch it run ────────────────────────────────────────────
  const runIndex = useCallback(() => {
    indexAbort.current?.abort();
    const controller = new AbortController();
    indexAbort.current = controller;
    void (async () => {
      // Inside the async body: this state IS the subscription starting, and a
      // synchronous setState from an effect is what cascades renders.
      setIndexState({ ...IDLE_INDEX_STATE, phase: "starting" });
      try {
        for await (const event of streamExportIndex(libraryId, controller.signal)) {
          if (event.type === "library.index.started") {
            setLibrary((current) => ({
              ...(current ?? { id: libraryId, name: "This export" }),
              adapter: event.adapter,
              adapter_label: event.adapter_label,
              detected_from: event.detected_from,
              bytes: event.bytes,
            }));
            setIndexState((s) => ({ ...s, phase: "running" }));
          } else if (event.type === "library.index.page") {
            setIndexState((s) => ({
              ...s,
              phase: "running",
              cumulative: event.cumulative,
              elapsedMs: event.elapsed_ms,
            }));
          } else if (event.type === "library.index.completed") {
            setSummary(event.summary);
            setIndexState({
              phase: "completed",
              cumulative: event.total_indexed,
              elapsedMs: event.elapsed_ms,
              message: null,
              partialTotal: null,
            });
          } else if (event.type === "library.index.failed") {
            setIndexState({
              phase: "failed",
              cumulative: event.partial_total,
              elapsedMs: 0,
              message: event.message,
              partialTotal: event.partial_total,
            });
          }
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setIndexState({
          phase: "failed",
          cumulative: 0,
          elapsedMs: 0,
          // The connection dropping is NOT the index stopping — say which one
          // this was, rather than implying the work was lost.
          message: `The live progress connection failed (${extractErrorMessage(error)}). Indexing may still be running on the server — reload to see where it got to.`,
          partialTotal: null,
        });
      }
    })();
  }, [libraryId]);

  /**
   * Index only what has not been indexed, and never what is being indexed.
   *
   * A Library that came back WITH a summary is done; re-POSTing would redo work
   * nobody asked for.
   *
   * 🚨 AND A LIBRARY THE SERVER SAYS IS `syncing` IS ALREADY BEING READ. An
   * index pass is authoritative — it clears the Library's rows and rebuilds
   * them — so a second pass started from a re-mount does not "resume", it
   * throws away the progress of the pass still running and starts from zero.
   * On a 1 GB mailbox that is minutes of work lost to opening the page twice.
   * The status is the server's own; if a pass really died mid-read it stays
   * `syncing` and the person's own "Index it again" is the way back, which is
   * the right place for that decision.
   */
  useEffect(() => {
    if (!library) return;
    if (summary) return;
    if (indexState.phase !== "idle") return;
    if (library.status === "syncing") {
      // Not a stand-in and not a guess: the server says it is reading this
      // export right now. Starting a second pass would throw that progress
      // away, so this shows the live readout instead — and only claims a
      // COUNT when the server has published one. `item_count` is written when
      // a pass ends, so mid-pass it is 0, and "Found 0 items so far" beside a
      // list already showing tens of thousands would be the screen lying about
      // the very thing it is reporting.
      const counted = library.total_items ?? 0;
      setIndexState({
        phase: counted > 0 ? "running" : "starting",
        cumulative: counted,
        elapsedMs: 0,
        message: null,
        partialTotal: null,
      });
      return;
    }
    runIndex();
  }, [library, summary, indexState.phase, runIndex]);

  useEffect(() => () => indexAbort.current?.abort(), []);

  // ─── The list ───────────────────────────────────────────────────────────
  const onPageRead = useCallback((next: ExportPageFacts) => setFacts(next), []);

  const onSendRequested = useCallback(
    (pending: Omit<PendingSend, "requestId">) =>
      new Promise<EntityBulkActionResult | void>((resolve) => {
        setOpenSend({
          pending: { ...pending, requestId: Date.now() },
          resolve,
        });
      }),
    [],
  );

  const libraryName = library?.name ?? "This export";

  /**
   * 🚨 EVERY NUMBER ON THIS SCREEN, DERIVED ONCE (defect D6).
   *
   * The strip, the details sheet, the progress banner, the scope tab and the
   * list header used to read four different sources — the published summary,
   * the index stream's cumulative, the last items response, and an extra
   * `limit=1` request of its own — taken at four different moments. Mid-index
   * they contradicted each other in front of the person: "WITH A FILE —" on
   * the card beside "158 of 4,000 items … with an attachment" in the list.
   * One object, built here, is what every one of them renders now.
   */
  const counts = useMemo(
    () =>
      deriveExportCounts({
        summary,
        indexedSoFar:
          indexState.phase === "running" || indexState.phase === "completed"
            ? indexState.cumulative
            : null,
        indexing:
          indexState.phase === "starting" || indexState.phase === "running",
        facts,
      }),
    [summary, indexState.phase, indexState.cumulative, facts],
  );

  const listConfig = useMemo(
    () =>
      createExportItemsListConfig({
        libraryId,
        getSummary: () => summary,
        // The facet options for labels, threads and correspondents come from
        // the summary, so the shell must re-ask once it lands.
        summaryKey: summary ? `summary-${summary.total_items}` : "no-summary",
        onPageRead,
        onSendRequested,
        // A VALUE, not a ref read: the confirm sentence must quote the filter
        // the person is looking at, and that is exactly this render's facts.
        filterDescription: facts?.filterDescription ?? "",
      }),
    [libraryId, summary, onPageRead, onSendRequested, facts?.filterDescription],
  );



  // ─── "Sent by me" when the server could not say who "me" is ─────────────
  const outboundBy = summary && !summary.owner_identity ? ownerOverride : null;
  const pickOwner = useCallback(
    (key: string | null) => {
      setOwnerOverride(key);
      try {
        if (key) window.localStorage.setItem(ownerOverrideKey(libraryId), key);
        else window.localStorage.removeItem(ownerOverrideKey(libraryId));
      } catch {
        // Blocked storage: the choice still applies for this visit.
      }
    },
    [libraryId],
  );

  // One chip = one narrowing, ADDED to whatever is already applied and
  // written to the URL — which on this surface IS the list's query.
  const urlParams = useUrlSearchParams();
  const narrow = useCallback(
    (filterId: string, value: string) => {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(urlParams.get("filters") ?? "{}") as Record<
          string,
          unknown
        >;
      } catch {
        current = {};
      }
      commitUrlParams(
        {
          filters: JSON.stringify({
            ...current,
            [filterId]: { kind: "select", values: [value] },
          }),
          page: null,
        },
        "push",
      );
    },
    [urlParams],
  );

  return (
    <>
      <PageHeader>
        <ExportsHeader libraryName={libraryName} />
      </PageHeader>

      <div className="matrx-touch-targets flex h-full flex-col overflow-hidden">
        <div className="shrink-0 space-y-2 px-3 pb-2 pt-[calc(var(--shell-header-h)+0.5rem)]">
          {readError && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                The summary of this export could not be read ({readError}). The
                items below are a separate read and are real; only the
                breakdown above them is missing.
                <ErrorAlchemyMenu error={readError} />
              </span>
            </p>
          )}

          {/* One line per item (or item recipient) the server sent that this
              build could not read — dropped, never guessed, and never hiding
              the items below that DID read correctly. Same treatment as the
              Libraries lane in `features/source-library`. */}
          {facts?.rowProblems.map((problem, index) => (
            <p
              key={`export-item-row-problem-${index}`}
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{problem}</span>
            </p>
          ))}

          <LibrarySummary
            library={library}
            summary={summary}
            counts={counts}
            ownerOverride={ownerOverride}
            onPickOwner={pickOwner}
            onNarrow={narrow}
          />

          <IndexProgress state={indexState} counts={counts} onRetry={runIndex} />

          <QuickViews
              libraryId={libraryId} outboundBy={outboundBy} />

          {/* Both numbers, always — and from the SAME object the strip above
              renders, so they cannot disagree at any moment. */}
          <ExportListTotals counts={counts} />
        </div>

        <div className="min-h-0 flex-1">
          <EntityListPage<ExportItem>
            config={listConfig}
            clearsShellHeader={false}
          />
        </div>
      </div>

      {/*
        The bulk action's promise and the dialog's visibility are DELIBERATELY
        separate. The shell holds its button in a pending state until the
        promise settles, so a successful send resolves it IMMEDIATELY — while
        the dialog stays open on its "Sent · Open the Rulebook" panel, which is
        the door to the thing that was just created.
      */}
      <SendToRulebookDialog
        key={openSend?.pending.requestId ?? 0}
        libraryId={libraryId}
        libraryName={libraryName}
        pending={openSend?.pending ?? null}
        onCancel={() => {
          openSend?.resolve(undefined);
          setOpenSend(null);
        }}
        onDismiss={() => setOpenSend(null)}
        onSent={(result) =>
          openSend?.resolve({
            message: `${result.sent.toLocaleString()} ${result.sent === 1 ? "item" : "items"} sent to ${result.rulebookName}`,
          })
        }
      />
    </>
  );
}
