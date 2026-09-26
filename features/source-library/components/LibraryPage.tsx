"use client";

/**
 * One Library: the metrics that fill in while the catalogue streams, the
 * Sources list under them, the server's Actions on a selection, and the jobs
 * those Actions started.
 *
 * 🚨 HOW A RELOAD MID-JOB LOSES NOTHING. Every number on this page has a server
 * mount read behind it — `GET …/videos`, `GET …/metrics`, `GET …/jobs` and
 * `GET /media/jobs/{id}` — and `useJob` reads before it streams.
 *
 * This file used to say the contract published no way to ASK which jobs belong to
 * a Library, and kept job ids in `localStorage` instead. That was wrong:
 * `GET /media/libraries/{id}/jobs` is the contract's own "job discovery door" and
 * the server has always served it. Believing otherwise is what made the
 * `POST …/jobs` envelope defect cost real money — the id never arrived, so nothing
 * was remembered, so a running billable job was unfindable from this screen while
 * its rows sat in the database. The server's rows are now the only authority here;
 * the per-device store is gone, because a second door that can be empty beside a
 * door that cannot is not a fallback, it is the bug.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, RefreshCw } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
    MediaApiError,
    getLibrary,
    getLibraryMetrics,
    isOrganizationNotReady,
    listLibraryJobs,
} from "../api";
import { createCatalogListConfig } from "../catalog/listConfig";
import { useActionRegistry } from "../hooks/useActionRegistry";
import { useActionRunner } from "../hooks/useActionRunner";
import { useLibrarySync } from "../hooks/useLibrarySync";
import {
    libraryLoaded,
    metricsLoaded,
    selectLibraryLive,
} from "../redux/sourceLibrarySlice";
import type { VideoRow } from "../types";
import { sourceVocabulary } from "../vocabulary";
import { JobPanel } from "./JobPanel";
import { LibraryMetricsHeader } from "./LibraryMetricsHeader";
import { SourceDetailPanel } from "./SourceDetailPanel";
import { CataloguedSourcesList } from "./CataloguedSourcesList";
import { SourceStateCell } from "../catalog/SourceStateCell";
import {
    anyTranscribing,
    catalogSourceState,
    type SourceStateContext,
} from "../catalog/sourceState";
import { listsCataloguedSources } from "../catalog/cataloguedSources";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function LibraryPage({ libraryId }: { libraryId: string }) {
    const dispatch = useAppDispatch();
    const router = useRouter();
    const params = useSearchParams();
    const live = useAppSelector((state) => selectLibraryLive(state, libraryId));
    const organizationId = useAppSelector(selectOrganizationId);

    const [loadError, setLoadError] = useState<string | null>(null);
    // D5: true whenever the most recent Library-ROW read (mount or the
    // still-syncing poll below) failed. This is NOT the same signal as
    // `loadError` staying non-null forever — a later poll can succeed and
    // clear it — but it is what `LibraryMetricsHeader` needs to tell "this
    // Library really has never synced" from "we do not currently know",
    // which `last_synced_at` alone cannot say.
    const [rowUnavailable, setRowUnavailable] = useState(false);
    /** The raw failure of the last Library-ROW read, for `<AccessGate error/>`. */
    const [rowReadError, setRowReadError] = useState<unknown>(null);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [metricsProblems, setMetricsProblems] = useState<string[]>([]);
    const [openVideo, setOpenVideo] = useState<VideoRow | null>(null);
    const [jobIds, setJobIds] = useState<string[]>([]);
    const [jobsDoorError, setJobsDoorError] = useState<string | null>(null);
    // 🚨 One job's shape being unreadable must never hide every OTHER job on
    // this Library — see `mapListRows` in `lib/contract/narrow.ts`. The jobs
    // that DID parse are still in `jobIds` below; this only names the ones
    // that did not, one honest line each, right beside the jobs a person can
    // actually see and act on.
    const [jobsRowProblems, setJobsRowProblems] = useState<string[]>([]);
    const [listGeneration, setListGeneration] = useState(0);
    const startedRef = useRef(false);
    // Every metrics read takes a ticket. A read that returns after a newer one
    // started never writes the screen, so the very first attempt cannot outlive
    // the successful one behind it.
    const metricsAttemptRef = useRef(0);

    const registry = useActionRegistry();

    // 🚨 A FAILED READ IS NEVER A SKELETON. Swallowing this error left the
    // header promising numbers that were never coming: on a Library whose
    // catalogue had failed, every tile and the cadence chart sat in a loading
    // skeleton forever, with no message, no timeout and no retry. So the
    // sentence is kept. Numbers we ALREADY hold are still never blanked — the
    // header only switches to the failure copy while it holds nothing.
    // 🚨 AND A NOT-YET IS NEVER A FAILURE — AND NO ORGANIZATION IS NEVER A
    // WALL. These are READS of one Library (Arman, 2026-09-23: "The permission
    // is to the person, not the org"). They used to wait for an active
    // organization and, with none selected, never happened at all — the page
    // sat empty until an organization was picked. The transport now waits the
    // bounded beat for a restore in flight and then sends a read naming no
    // organization; the server decides by the person's access
    // (`iam.has_access_for`). The not-ready code is still ignored if it arrives,
    // and a stale answer still cannot overwrite a newer one.
    const refreshMetrics = useCallback(async () => {
        const attempt = ++metricsAttemptRef.current;
        try {
            const { value: metrics, problems } = await getLibraryMetrics(
                dispatch,
                libraryId,
            );
            if (attempt !== metricsAttemptRef.current) return;
            dispatch(metricsLoaded({ libraryId, metrics }));
            setMetricsError(null);
            // 🚨 A STAND-IN ANNOUNCES ITSELF. A number the server mislabelled
            // that this screen could work out from the ones beside it is USED —
            // the header is not blanked over a redundant field — and said out
            // loud, here, rather than passed off as the server's own figure.
            setMetricsProblems(problems);
        } catch (error) {
            if (attempt !== metricsAttemptRef.current) return;
            if (isOrganizationNotReady(error)) {
                setMetricsError(null);
                return;
            }
            setMetricsError(
                error instanceof MediaApiError
                    ? error.status === 404 && !error.hasServerSentence
                        ? "This server does not answer at the Libraries address yet, so the numbers for this Library cannot be computed. Nothing you did caused this."
                        : error.message
                    : "The numbers for this Library could not be read from the server.",
            );
        }
        // `organizationId` is NOT a gate — a switch simply re-reads, so the
        // numbers on screen are never older than the workspace around them.
    }, [dispatch, libraryId, organizationId]);

    const sync = useLibrarySync(libraryId, () => {
        void refreshMetrics();
        setListGeneration((n) => n + 1);
    });

    // 🚨 THE ONE ROW READ, SHARED (D5, jobs-bar cold-walk-12, 2026-09-19). Both
    // the mount read below and the "still syncing" poll further down used to
    // read the Library row with two different bodies of error handling — the
    // mount read set `loadError` on failure, the poll's `catch` swallowed
    // EVERYTHING with a comment claiming "a genuine read failure is already
    // surfaced by the mount read's own `loadError`", which is only true of the
    // read that comment is attached to. A CORS-blocked (or otherwise failed)
    // POLL read left `loadError` null and the LAST KNOWN `library` row exactly
    // as it was — including a `last_synced_at` that was never populated
    // because `syncEvent`'s "completed" case never wrote one either. The
    // freshness banner (`SyncStrip`, `LibraryMetricsHeader.tsx`) has no idea a
    // read ever failed, reads `last_synced_at` on its own, and — with the field
    // genuinely absent — printed "This Library has never been brought up to
    // date." directly under a metrics block computed moments earlier: a failed
    // read rendered as an empty answer, the exact class law 4 forbids. Both
    // reads now share this one function, and BOTH failures are recorded, so
    // `LibraryMetricsHeader` can tell "nothing has ever synced" from "we could
    // not check" and never claim the former when it only knows the latter.
    const loadLibraryRow = useCallback(async () => {
        try {
            const row = await getLibrary(dispatch, libraryId);
            dispatch(libraryLoaded(row));
            setLoadError(null);
            setRowUnavailable(false);
            setRowReadError(null);
            return row;
        } catch (error) {
            if (isOrganizationNotReady(error)) return null;
            // A 404 with no sentence of its own means the endpoint is not
            // on this server build — not that the Library is missing. The
            // platform's generic "the server has nothing at that address"
            // is true but tells a person nothing they can act on.
            setLoadError(
                error instanceof MediaApiError
                    ? error.status === 404 && !error.hasServerSentence
                        ? "This server does not answer at the Libraries address yet, so this Library cannot be read. It arrives with the Media Source Catalog server release; nothing you did caused this."
                        : error.message
                    : "This Library could not be read from the server.",
            );
            setRowUnavailable(true);
            setRowReadError(error);
            return null;
        }
    }, [dispatch, libraryId]);

    // Mount reads — the Library row and its metrics, before anything streams.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            if (cancelled) return;
            await loadLibraryRow();
        })();
        void refreshMetrics();
        return () => {
            cancelled = true;
        };
    }, [dispatch, libraryId, organizationId, refreshMetrics, loadLibraryRow]);

    // 🚨 THE JOB-DISCOVERY MOUNT READ — the server is the door back to a job,
    // and this page had never opened it.
    //
    // `GET /media/libraries/{id}/jobs` has been published and implemented the whole
    // time; this page kept ids in `localStorage` instead and the comment at the top
    // of this file said the endpoint did not exist. It does. That mistake is what
    // turned the `POST …/jobs` envelope defect from an ugly error message into lost
    // money: the response was unreadable, so no id was ever remembered, so a real
    // running paid transcription was invisible on this screen forever — while its
    // rows sat in the database the entire time, findable by this one call.
    //
    // So the durable rows are now the authority and `localStorage` is gone. This asks
    // only for the jobs that are still going: a person must be able to find work that
    // is running and spending, and a finished job's panel is history, not an alarm.
    // Anything started in this tab is added by `onJobStarted` regardless of status.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const found = await listLibraryJobs(dispatch, libraryId, {
                    status: ["pending", "running"],
                    limit: 10,
                });
                if (cancelled) return;
                const live = found.jobs.map((job) => job.id);
                // Union, never replace: a job this tab just started is not in the
                // answer to a read that raced it.
                setJobIds((current) => [
                    ...live,
                    ...current.filter((id) => !live.includes(id)),
                ]);
                // Every job that DID parse is already in `live` above. Name the
                // ones that did not — one honest line each — without touching
                // the jobs that are fine.
                setJobsRowProblems(found.row_problems);
            } catch (error) {
                if (cancelled || isOrganizationNotReady(error)) return;
                // NOTHING FAILS SILENTLY. A job may be running and spending right
                // now and this screen cannot list it — say so, with the remedy,
                // rather than showing an empty panel area that reads as "no jobs".
                setJobsDoorError(
                    error instanceof MediaApiError
                        ? `Work already running on this Library could not be listed, so anything in progress is not shown below. ${error.message}`
                        : "Work already running on this Library could not be listed, so anything in progress is not shown below. Reload to try again.",
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dispatch, libraryId]);

    // 🚨 THE SEAM: THIS TAB'S SYNC SLICE VS. THE SERVER'S LIBRARY ROW. The mount
    // effect above reads the Library row exactly ONCE. When that one read lands
    // mid-run — `sync_status: "syncing"`, started in another tab or an earlier
    // session this one never streamed — nothing here ever asked again, so the
    // banner in `LibraryMetricsHeader` could only ever clear if the PERSON
    // manually reloaded the whole page and happened to catch the row after the
    // server had actually flipped it. kottke.org (2026-09-19) reloaded four
    // times over two-plus minutes and never caught it. So while this tab is
    // NOT the one running the sync (`sync.sync.phase === "idle"` — a run this
    // tab itself started is already live via the stream and needs no polling)
    // and the last-known row says "syncing", this re-asks the one door that
    // can ever change that answer, on its own, until it does.
    useEffect(() => {
        if (live?.library?.sync_status !== "syncing") return;
        if (sync.sync.phase !== "idle") return;
        let cancelled = false;
        const intervalId = window.setInterval(() => {
            void (async () => {
                // D5: this used to swallow every failure with a comment
                // claiming the mount read's `loadError` already covers it —
                // true of THAT read, never of one that fails later, here. A
                // CORS-blocked (or any other) poll failure now goes through
                // the SAME recorder the mount read uses, so `loadError` and
                // `rowUnavailable` are honest about the read that actually
                // failed, and the freshness banner can say "we could not
                // check" instead of quietly repeating whatever `library` last
                // held — which, for a Library never read successfully before
                // this poll started, is nothing at all.
                const row = await loadLibraryRow();
                if (cancelled || row === null) return;
                if (row.sync_status !== "syncing") {
                    void refreshMetrics();
                    setListGeneration((n) => n + 1);
                }
            })();
        }, 5000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [
        dispatch,
        libraryId,
        live?.library?.sync_status,
        sync.sync.phase,
        refreshMetrics,
        loadLibraryRow,
    ]);

    // `?sync=1` (fresh from the paste box) and `?resync=1` (bring up to date)
    // both start the one enumeration door, once, then leave the address clean.
    useEffect(() => {
        if (startedRef.current) return;
        const wants = params.get("sync") === "1" || params.get("resync") === "1";
        if (params.get("already") === "1") {
            toast.info("You already had this one — here it is.");
            router.replace(`/libraries/${libraryId}`);
        }
        if (!wants) return;
        startedRef.current = true;
        router.replace(`/libraries/${libraryId}`);
        void sync.start("full");
    }, [libraryId, params, router, sync]);

    const onJobStarted = useCallback(
        (jobId: string) => {
            setJobIds((current) => [jobId, ...current.filter((id) => id !== jobId)]);
        },
        [],
    );

    const library = live?.library ?? null;
    // D6b (jobs-bar cold-walk-12): this Library's own words, so a confirm
    // dialog, a job's name and a job panel never say "video(s)" over a
    // podcast episode or a blog post.
    const vocabulary = useMemo(() => sourceVocabulary(library), [library]);

    const runner = useActionRunner(libraryId, registry.actions, onJobStarted, vocabulary);

    // §8.6 — rows this screen started a Transcribe for, watched until the server
    // reports the run (queued/running) and then the Source id it landed as.
    const [pendingTranscribe, setPendingTranscribe] = useState<Record<string, number>>({});
    const registryActions = registry.actions;
    const registryAnswered = !registry.loading || registryActions.length > 0;
    const transcribable = library ? vocabulary.transcribable : null;
    const runOn = runner.runOn;
    const sourceCells = useMemo(() => {
        const contextAt = (now: number): SourceStateContext => ({
            pending: pendingTranscribe,
            now,
            actions: registryAnswered ? registryActions : undefined,
            transcribable,
        });
        const transcribeAction = registryActions.find((action) => action.key === "transcribe");
        const onTranscribe = transcribeAction
            ? (row: VideoRow) => {
                  void runOn(transcribeAction, [row]).then((message) => {
                      if (!message) return;
                      toast.success(message);
                      setPendingTranscribe((current) => ({ ...current, [row.id]: Date.now() }));
                  });
              }
            : undefined;
        return {
            contextAt,
            onTranscribe,
            renderSource: (row: VideoRow) => (
                <SourceStateCell
                    row={row}
                    state={catalogSourceState(row, contextAt(Date.now()))}
                    onTranscribe={onTranscribe}
                />
            ),
            isTranscribing: (rows: readonly VideoRow[]) =>
                anyTranscribing(rows, contextAt(Date.now())),
        };
    }, [pendingTranscribe, registryActions, registryAnswered, transcribable, runOn]);

    // D6 (jobs-bar cold-walk-12): a sync that just reported rows for THIS
    // Library and a table that still says "nothing catalogued" is the exact
    // defect — the banner and the table read two different sources, and
    // nothing told the table to look again. `sync.listed` is the same number
    // `LibraryMetricsHeader`'s "Up to date — N Sources listed" banner prints.
    const syncReportsRows = live?.sync.listed != null && live.sync.listed > 0;

    const config = useMemo(
        () =>
            createCatalogListConfig({
                dispatch,
                libraryId,
                organizationId,
                bulkActions: runner.bulkActions,
                onOpenRow: setOpenVideo,
                // §4.3 — the Action labels come from the SERVER'S registry, the
                // same one the Action bar is built from. Before it answers, a
                // Source's outcome shows the Action's key: ugly and true.
                actionLabels: Object.fromEntries(
                    registry.actions.map((action) => [action.key, action.label]),
                ),
                // The way back from "this one failed" to the run that says why.
                // `onJobStarted` is exactly the right door: it puts the job's own
                // panel on this page, which is where a person already reads one.
                onOpenJob: onJobStarted,
                library,
                // D6: THE actual re-read. `listGeneration` used to only build a
                // new `config` object, which does nothing on its own — the shell
                // re-asks a service when `serviceKey` changes (see
                // `lib/entity-list/useEntityList.ts`), and that string never
                // named `listGeneration`. Folding it in here is what makes
                // `library.sync.completed` (via `useLibrarySync`'s `onSettled`)
                // actually trigger a fresh `GET …/videos`.
                refreshToken: listGeneration,
                syncReportsRows,
                renderSource: sourceCells.renderSource,
                isTranscribing: sourceCells.isTranscribing,
            }),
        [
            sourceCells,
            dispatch,
            libraryId,
            organizationId,
            runner.bulkActions,
            listGeneration,
            registry.actions,
            onJobStarted,
            library,
            syncReportsRows,
        ],
    );

    // The Library row could not be read and we hold none: the one thing this
    // page is about is unavailable (denied, deleted, missing, or a real fault).
    // A failed POLL while a row is already held keeps the notice below instead.
    if (!library && rowUnavailable) {
        return (
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
                <AccessGate
                    token="media_source_library"
                    id={libraryId}
                    error={rowReadError ?? undefined}
                    onRetry={() => void loadLibraryRow()}
                    fallbackHref="/libraries"
                    fallbackLabel="Your libraries"
                />
            </div>
        );
    }

    // A web-capture Library files its Sources by edge; the catalog read cannot see them.
    if (library && listsCataloguedSources(library.adapter)) {
        return (
            <>
                <PageHeader>
                    <h1 className="truncate text-sm font-medium">{library.name}</h1>
                </PageHeader>
                <CataloguedSourcesList libraryId={libraryId} organizationId={organizationId} />
            </>
        );
    }

    return (
        <>
            <PageHeader>
                <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-sm font-medium">
                        {library?.name ?? "Library"}
                    </h1>
                    {library?.handle ? (
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                            {library.handle}
                        </span>
                    ) : null}
                </div>
            </PageHeader>

            <EntityListPage
                config={config}
                notice={
                    <div className="space-y-3 pb-3">
                        {loadError && (
                            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                                {loadError}
                              <ErrorAlchemyMenu error={loadError} />
                            </p>
                        )}

                        {metricsProblems.map((problem) => (
                            <p
                                key={problem}
                                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground"
                            >
                                <CircleAlert
                                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                                    aria-hidden
                                />
                                {problem}
                              <ErrorAlchemyMenu error={problem} />
                            </p>
                        ))}

                        <LibraryMetricsHeader
                            library={library}
                            metrics={live?.metrics ?? null}
                            metricsError={metricsError}
                            onRetryMetrics={() => void refreshMetrics()}
                            sync={sync.sync}
                            elapsedMs={sync.elapsedMs}
                            onBringUpToDate={() => void sync.start("full")}
                            bringUpToDateDisabled={sync.isRunning}
                            rowUnavailable={rowUnavailable}
                            onRetryRow={() => void loadLibraryRow()}
                        />

                        {registry.error && (
                            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                                <CircleAlert
                                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                                    aria-hidden
                                />
                                <span>
                                    {registry.error}
                                    {registry.remedy ? ` (${registry.remedy.replace(/_/g, " ")})` : ""}
                                    <Button
                                        variant="link"
                                        className="ml-1 h-auto p-0 text-sm"
                                        onClick={() => void registry.reload()}
                                    >
                                        Check again
                                    </Button>
                                  <ErrorAlchemyMenu error={registry.error} />
                                </span>
                            </p>
                        )}

                        {/* NOTHING FAILS SILENTLY: work may be running and
                            spending right now that this screen could not list. An
                            empty space here would read as "nothing is running". */}
                        {jobsDoorError && (
                            <p className="flex items-start gap-2 text-sm text-destructive">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                                <span>
                                    {jobsDoorError}
                                    <Button
                                        variant="link"
                                        className="ml-1 h-auto p-0 text-sm"
                                        onClick={() => router.refresh()}
                                    >
                                        Try again
                                    </Button>
                                </span>
                              <ErrorAlchemyMenu error={jobsDoorError} />
                            </p>
                        )}

                        {/* One line per job the server sent but this build could
                            not read — dropped, never guessed, and never hiding
                            the jobs below that DID read correctly. */}
                        {jobsRowProblems.map((problem, index) => (
                            <p
                                key={`job-row-problem-${index}`}
                                className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                                <CircleAlert
                                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                                    aria-hidden
                                />
                                <span>{problem}</span>
                            </p>
                        ))}

                        {jobIds.map((jobId) => (
                            <JobPanel
                                key={jobId}
                                jobId={jobId}
                                vocabulary={vocabulary}
                                onDismiss={() =>
                                    setJobIds((current) =>
                                        current.filter((id) => id !== jobId),
                                    )
                                }
                            />
                        ))}
                    </div>
                }
                /* 🚨 THERE IS ONE "Bring up to date" ON THIS PAGE (jobs-bar
                   cold-walk-13, Friction). A second copy lived here, in the
                   list toolbar, about 300px below the identical button in the
                   metrics header — two controls, same words, same verb, and
                   nothing on screen to say whether they differed. The header's
                   is the one that survives: it carries the running state, the
                   honest disabled reasons ("A sync is running right now…" /
                   "This Library cannot be brought up to date from here right
                   now.") and the stale-numbers notice underneath it. This one
                   carried none of that, so keeping it would mean keeping the
                   poorer of two identical promises. Adding an affordance
                   obliges you to delete the one it replaces — and so does
                   finding you already have two. */
            />

            {runner.dialog}

            <Dialog
                open={openVideo !== null}
                onOpenChange={(next) => (!next ? setOpenVideo(null) : undefined)}
            >
                <DialogContent className="flex max-h-[88dvh] flex-col p-0 sm:max-w-3xl">
                    <DialogTitle className="sr-only">
                        {openVideo?.title ?? "Source"}
                    </DialogTitle>
                    {openVideo ? (
                        <SourceDetailPanel
                            video={openVideo}
                            onClose={() => setOpenVideo(null)}
                            vocabulary={vocabulary}
                            onTranscribe={
                                sourceCells.onTranscribe &&
                                catalogSourceState(openVideo, sourceCells.contextAt(Date.now()))
                                    .kind === "not_yet"
                                    ? (video) => {
                                          setOpenVideo(null);
                                          sourceCells.onTranscribe?.(video);
                                      }
                                    : undefined
                            }
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
