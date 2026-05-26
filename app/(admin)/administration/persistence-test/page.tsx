"use client";

/**
 * Window Panels — Persistence Loop Tester
 *
 * A focused diagnostic page that exercises every step of the
 * window-session persistence loop and shows the live state at each
 * boundary. Designed to answer "where exactly is persistence breaking?"
 * by showing all four sources of truth side-by-side:
 *
 *   1. DB rows in `public.window_sessions` (refreshable on demand)
 *   2. Redux `state.overlays` (which overlays are open + their data)
 *   3. Redux `state.windowManager` (geometry / z-index / tray slot)
 *   4. The persistence context (hydrated flag, session-id map)
 *
 * Action buttons at the top let you push the loop through each step
 * deliberately and watch where it succeeds or fails.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
    closeOverlay,
    openOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { useWindowPersistence } from "@/features/window-panels/WindowPersistenceManager";
import {
    deleteAllWindowSessions,
    loadWindowSessions,
} from "@/features/window-panels/service/windowPersistenceService";
import type { WindowSessionRow } from "@/features/window-panels/registry/windowRegistryTypes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    Trash2,
    RefreshCw,
    PlayCircle,
    Save,
    X,
    RotateCcw,
} from "lucide-react";

// Test target: a real persistable window with non-empty defaultData and a
// known componentImport. notesWindow ticks both boxes — multi-instance is
// false, so the singleton "default" slot is what gets persisted.
const TEST_OVERLAY_ID = "notesWindow";

interface LogEntry {
    at: string;
    level: "info" | "ok" | "error";
    message: string;
}

export default function PersistenceTestPage() {
    const isProd = process.env.NODE_ENV === "production";
    const isAdmin = useAppSelector(selectIsSuperAdmin);
    const userId = useAppSelector(selectUserId);
    const dispatch = useAppDispatch();
    const persistence = useWindowPersistence();

    const overlaysState = useAppSelector((s) => s.overlays.overlays);
    const windowManagerState = useAppSelector((s) => s.windowManager);

    const [dbRows, setDbRows] = useState<WindowSessionRow[]>([]);
    const [dbLoading, setDbLoading] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);

    const append = useCallback(
        (level: LogEntry["level"], message: string) => {
            setLog((prev) =>
                [
                    {
                        at: new Date().toLocaleTimeString(),
                        level,
                        message,
                    },
                    ...prev,
                ].slice(0, 200),
            );
        },
        [],
    );

    // ── Load DB rows ────────────────────────────────────────────────────────

    const refreshDb = useCallback(async () => {
        if (!userId) {
            append("error", "Cannot read window_sessions — no userId in Redux");
            return;
        }
        setDbLoading(true);
        setDbError(null);
        try {
            const rows = await loadWindowSessions(userId);
            setDbRows(rows);
            append("ok", `Loaded ${rows.length} window_sessions row(s) from DB`);
        } catch (err) {
            const msg = (err as Error).message ?? String(err);
            setDbError(msg);
            append("error", `loadWindowSessions failed: ${msg}`);
        } finally {
            setDbLoading(false);
        }
    }, [userId, append]);

    // Load on mount + whenever userId changes.
    useEffect(() => {
        if (userId) refreshDb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ── Actions ─────────────────────────────────────────────────────────────

    const openTest = useCallback(() => {
        const data = {
            openTabs: ["test-tab"],
            activeTabId: "test-tab",
            __testStamp: new Date().toISOString(),
        };
        dispatch(openOverlay({ overlayId: TEST_OVERLAY_ID, data }));
        append(
            "ok",
            `dispatch(openOverlay) → ${TEST_OVERLAY_ID} (default instance) with test data`,
        );
    }, [dispatch, append]);

    const saveTest = useCallback(() => {
        // Mock panelState — in the real flow WindowPanel collects this from
        // the Redux windowManagerSlice + useWindowPanel hook. Here we just
        // pass a known shape so we can prove the row writes correctly.
        const panelState = {
            rect: { x: 240, y: 160, width: 720, height: 480 },
            windowState: "windowed" as const,
            zIndex: 1000,
            sidebarOpen: false,
        };
        const data = {
            openTabs: ["test-tab"],
            activeTabId: "test-tab",
            __testStamp: new Date().toISOString(),
        };
        append(
            "info",
            `Calling persistence.saveWindow("${TEST_OVERLAY_ID}", panelState, data)…`,
        );
        persistence.saveWindow(
            TEST_OVERLAY_ID,
            panelState,
            data,
            (sessionId) => {
                append("ok", `Save callback fired → sessionId=${sessionId}`);
                void refreshDb();
            },
        );
    }, [persistence, append, refreshDb]);

    const closeTest = useCallback(() => {
        dispatch(closeOverlay({ overlayId: TEST_OVERLAY_ID }));
        persistence.closeWindow(TEST_OVERLAY_ID);
        append(
            "ok",
            `Closed ${TEST_OVERLAY_ID} (overlay slice + persistence row delete)`,
        );
        void refreshDb();
    }, [dispatch, persistence, append, refreshDb]);

    const wipeAll = useCallback(async () => {
        if (!userId) return;
        try {
            await deleteAllWindowSessions(userId);
            append("ok", "Deleted all window_sessions rows for this user");
            void refreshDb();
        } catch (err) {
            append(
                "error",
                `deleteAllWindowSessions failed: ${(err as Error).message ?? err}`,
            );
        }
    }, [userId, append, refreshDb]);

    const reload = useCallback(() => {
        append("info", "Reloading page to test hydration…");
        // Give the log line a tick to render, then reload.
        setTimeout(() => window.location.reload(), 100);
    }, [append]);

    // ── Gates ───────────────────────────────────────────────────────────────

    if (isProd) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Persistence test is dev-only.
            </div>
        );
    }
    if (!isAdmin) {
        return (
            <div className="p-6 text-sm text-muted-foreground">
                Admin-gated. You don&rsquo;t have access.
            </div>
        );
    }

    const openOverlayCount = Object.values(overlaysState).reduce(
        (sum, bucket) =>
            sum +
            Object.values(bucket).filter((inst) => inst.isOpen).length,
        0,
    );

    return (
        <div className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden bg-textured">
            <header className="border-b border-border bg-card px-4 py-3">
                <h1 className="text-base font-semibold">
                    Window Panels — Persistence Loop Tester
                </h1>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Field label="userId" value={userId ?? "—"} mono />
                    <Field
                        label="hydrated"
                        value={persistence.hydrated ? "true" : "false"}
                        ok={persistence.hydrated}
                    />
                    <Field
                        label="overlays open"
                        value={String(openOverlayCount)}
                    />
                    <Field
                        label="DB rows"
                        value={dbLoading ? "…" : String(dbRows.length)}
                    />
                    <Field
                        label="session-id for test"
                        value={
                            persistence.getSessionId(TEST_OVERLAY_ID) ?? "(none)"
                        }
                        mono
                    />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                        size="sm"
                        onClick={openTest}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <PlayCircle className="h-3 w-3" />
                        Open {TEST_OVERLAY_ID}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={saveTest}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <Save className="h-3 w-3" />
                        Save state
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={closeTest}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <X className="h-3 w-3" />
                        Close + delete row
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={refreshDb}
                        disabled={dbLoading}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <RefreshCw
                            className={cn(
                                "h-3 w-3",
                                dbLoading && "animate-spin",
                            )}
                        />
                        Refresh DB
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={reload}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Reload page
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={wipeAll}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <Trash2 className="h-3 w-3" />
                        Delete all rows
                    </Button>
                </div>
            </header>

            <main className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-2">
                <Section title="window_sessions (DB)">
                    {dbError ? (
                        <pre className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">
                            {dbError}
                        </pre>
                    ) : null}
                    {dbRows.length === 0 ? (
                        <Empty message="No rows for this user. Click 'Save state' to write one." />
                    ) : (
                        dbRows.map((row) => (
                            <pre
                                key={row.id}
                                className="overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-[11px] leading-relaxed"
                            >
                                {JSON.stringify(row, null, 2)}
                            </pre>
                        ))
                    )}
                </Section>

                <Section title={`overlays (Redux state.overlays) — ${openOverlayCount} open`}>
                    {Object.keys(overlaysState).length === 0 ? (
                        <Empty message="No overlay buckets initialized. Click 'Open' to open one." />
                    ) : (
                        <pre className="overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-[11px] leading-relaxed">
                            {JSON.stringify(overlaysState, null, 2)}
                        </pre>
                    )}
                </Section>

                <Section title="windowManager (Redux state.windowManager)">
                    <pre className="overflow-x-auto rounded-md border border-border bg-card p-2 font-mono text-[11px] leading-relaxed">
                        {JSON.stringify(windowManagerState, null, 2)}
                    </pre>
                </Section>

                <Section title="Activity log">
                    {log.length === 0 ? (
                        <Empty message="Click an action button to start the loop." />
                    ) : (
                        <ol className="space-y-0.5 font-mono text-[11px]">
                            {log.map((entry, i) => (
                                <li
                                    key={i}
                                    className={cn(
                                        "rounded px-1.5 py-0.5",
                                        entry.level === "error" &&
                                            "bg-red-500/10 text-red-700 dark:text-red-300",
                                        entry.level === "ok" &&
                                            "bg-green-500/5 text-green-700 dark:text-green-300",
                                        entry.level === "info" &&
                                            "text-muted-foreground",
                                    )}
                                >
                                    <span className="text-muted-foreground">
                                        {entry.at}
                                    </span>{" "}
                                    {entry.message}
                                </li>
                            ))}
                        </ol>
                    )}
                </Section>
            </main>
        </div>
    );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Field({
    label,
    value,
    mono,
    ok,
}: {
    label: string;
    value: string;
    mono?: boolean;
    ok?: boolean;
}) {
    return (
        <Badge
            variant="secondary"
            className={cn(
                "gap-1.5 px-2 py-0.5 text-[10px] font-normal",
                ok === true && "bg-green-500/10 text-green-700 dark:text-green-300",
                ok === false && "bg-red-500/10 text-red-700 dark:text-red-300",
            )}
        >
            <span className="uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
            <span className={cn("text-foreground", mono && "font-mono")}>
                {value}
            </span>
        </Badge>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="flex min-h-0 flex-col rounded-md border border-border bg-card/40">
            <h2 className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
            </h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                {children}
            </div>
        </section>
    );
}

function Empty({ message }: { message: string }) {
    return (
        <p className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
            {message}
        </p>
    );
}
