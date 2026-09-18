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
import { JobPanel } from "./JobPanel";
import { LibraryMetricsHeader } from "./LibraryMetricsHeader";
import { SourceDetailPanel } from "./SourceDetailPanel";

export function LibraryPage({ libraryId }: { libraryId: string }) {
    const dispatch = useAppDispatch();
    const router = useRouter();
    const params = useSearchParams();
    const live = useAppSelector((state) => selectLibraryLive(state, libraryId));
    const organizationId = useAppSelector(selectOrganizationId);

    const [loadError, setLoadError] = useState<string | null>(null);
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

    // Both mount reads name `organizationId` as a dependency for the reason in
    // hooks/useActionRegistry.ts: it resolves after the first render and every
    // server call is refused until it does.
    // 🚨 A FAILED READ IS NEVER A SKELETON. Swallowing this error left the
    // header promising numbers that were never coming: on a Library whose
    // catalogue had failed, every tile and the cadence chart sat in a loading
    // skeleton forever, with no message, no timeout and no retry. So the
    // sentence is kept. Numbers we ALREADY hold are still never blanked — the
    // header only switches to the failure copy while it holds nothing.
    // 🚨 AND A NOT-YET IS NEVER A FAILURE. The transport is fail-closed and
    // refuses every authenticated call until the active organization resolves,
    // a beat after first render — so the FIRST read on a cold load always comes
    // back "Select an organization before sending this request". Recording that
    // put a sentence on the screen that was wrong twice over (the person has an
    // organization; nothing failed) and left it there, because the successful
    // read behind it had no way to overrule a failure already written. Now the
    // read does not happen at all until there is an organization to make it
    // with, the code is ignored if it arrives anyway, and a stale answer cannot
    // overwrite a newer one.
    const refreshMetrics = useCallback(async () => {
        if (!organizationId) return;
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
    }, [dispatch, libraryId, organizationId]);

    const sync = useLibrarySync(libraryId, () => {
        void refreshMetrics();
        setListGeneration((n) => n + 1);
    });

    // Mount reads — the Library row and its metrics, before anything streams.
    useEffect(() => {
        let cancelled = false;
        // Same not-yet gate as the metrics read: no organization, no call, and
        // this effect already re-runs the moment one lands.
        if (!organizationId) return;
        void (async () => {
            try {
                const row = await getLibrary(dispatch, libraryId);
                if (cancelled) return;
                dispatch(libraryLoaded(row));
                setLoadError(null);
            } catch (error) {
                if (cancelled) return;
                if (isOrganizationNotReady(error)) return;
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
            }
        })();
        void refreshMetrics();
        return () => {
            cancelled = true;
        };
    }, [dispatch, libraryId, organizationId, refreshMetrics]);

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
        if (!organizationId) return;
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
    }, [dispatch, libraryId, organizationId]);

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

    const runner = useActionRunner(libraryId, registry.actions, onJobStarted);

    const config = useMemo(
        () =>
            createCatalogListConfig({
                dispatch,
                libraryId,
                organizationId,
                bulkActions: runner.bulkActions,
                onOpenRow: setOpenVideo,
            }),
        // `listGeneration` forces a fresh service identity after a sync lands
        // rows, so the list re-asks instead of showing what it held before.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dispatch, libraryId, organizationId, runner.bulkActions, listGeneration],
    );

    const library = live?.library ?? null;

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
                                onDismiss={() =>
                                    setJobIds((current) =>
                                        current.filter((id) => id !== jobId),
                                    )
                                }
                            />
                        ))}
                    </div>
                }
                headerActions={
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-11 gap-2 lg:h-7"
                        disabled={sync.isRunning}
                        onClick={() => void sync.start("full")}
                    >
                        <RefreshCw
                            className={`size-4 ${sync.isRunning ? "animate-spin" : ""}`}
                            aria-hidden
                        />
                        <span className="max-sm:sr-only">Bring up to date</span>
                    </Button>
                }
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
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
