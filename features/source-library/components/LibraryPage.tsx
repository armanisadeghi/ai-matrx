"use client";

/**
 * One Library: the metrics that fill in while the catalogue streams, the
 * Sources list under them, the server's Actions on a selection, and the jobs
 * those Actions started.
 *
 * 🚨 HOW A RELOAD MID-JOB LOSES NOTHING. Every number on this page has a server
 * mount read behind it (`GET …/videos`, `GET …/metrics`, `GET /media/jobs/{id}`),
 * and `useJob` reads before it streams. The one thing the contract does not yet
 * publish is a way to ASK which jobs belong to a Library, so after a reload the
 * page would not know a job's id at all. Until
 * `GET /media/libraries/{id}/jobs` exists — filed in the contract's Frontend
 * requests section — the ids this browser started are remembered per viewer in
 * `localStorage`, which is honest about what it is: it restores the panel on
 * this device and says plainly that a job started elsewhere cannot be listed
 * here yet. The JOB itself is durable either way; this is only the door to it.
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
import { MediaApiError, getLibrary, getLibraryMetrics } from "../api";
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

/** Per-viewer, per-device door back to a job after a reload. Never the truth. */
function jobsKey(libraryId: string) {
    return `matrx.source-library.jobs.${libraryId}`;
}

function readRememberedJobs(libraryId: string): string[] {
    try {
        const raw = window.localStorage.getItem(jobsKey(libraryId));
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string")
            : [];
    } catch {
        return [];
    }
}

function rememberJob(libraryId: string, jobId: string) {
    try {
        const next = [jobId, ...readRememberedJobs(libraryId).filter((id) => id !== jobId)];
        window.localStorage.setItem(jobsKey(libraryId), JSON.stringify(next.slice(0, 10)));
    } catch {
        // A blocked or full store costs this device its shortcut back to the
        // panel, nothing else — the job is the server's and keeps running.
    }
}

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
    const [listGeneration, setListGeneration] = useState(0);
    const startedRef = useRef(false);

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
    const refreshMetrics = useCallback(async () => {
        try {
            const { value: metrics, problems } = await getLibraryMetrics(
                dispatch,
                libraryId,
            );
            dispatch(metricsLoaded({ libraryId, metrics }));
            setMetricsError(null);
            // 🚨 A STAND-IN ANNOUNCES ITSELF. A number the server mislabelled
            // that this screen could work out from the ones beside it is USED —
            // the header is not blanked over a redundant field — and said out
            // loud, here, rather than passed off as the server's own figure.
            setMetricsProblems(problems);
        } catch (error) {
            console.log(`[DIAG] refreshMetrics#${seq} FAIL ${String((error as Error)?.message).slice(0,60)}`);
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
        void (async () => {
            try {
                const row = await getLibrary(dispatch, libraryId);
                if (cancelled) return;
                dispatch(libraryLoaded(row));
                setLoadError(null);
            } catch (error) {
                if (cancelled) return;
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

    // Jobs this device started, restored so a reload lands back on the panel.
    useEffect(() => {
        setJobIds(readRememberedJobs(libraryId));
    }, [libraryId]);

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
            rememberJob(libraryId, jobId);
            setJobIds((current) => [jobId, ...current.filter((id) => id !== jobId)]);
        },
        [libraryId],
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
