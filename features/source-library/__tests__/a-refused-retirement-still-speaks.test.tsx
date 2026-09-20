/**
 * THE GAP: aidream `1a18dd0ad1` added `retire_refused` to
 * `library.sync.completed` — a full sync that would retire ≥50% of what it
 * just persisted refuses and removes nothing, rather than deleting a
 * catalogue out from under a person because of a shape that looks like a
 * reconciliation bug. A verifier (2026-09-19) confirmed this feature's event
 * narrowing silently dropped the field: `parseSyncEvent`'s `library.sync.
 * completed` case never read `row.retire_refused`, so a person whose sync
 * was refused saw an ordinary "Up to date" banner with no sentence at all.
 * "Nothing fails silently" (`the-nine-laws.md` #4).
 *
 * RED PROOF (run it, do not trust this comment):
 *   In `../contract.ts`, delete the `retire_refused: optBool(...)` line from
 *   the `library.sync.completed` case (and, to see the type-level half of
 *   the same gap, delete `retire_refused: boolean;` from the matching
 *   variant in `../types.ts`).
 *   → Block A fails: `parsed.event.retire_refused` is `undefined`, not
 *     `true`, because the field was read straight off the wire object
 *     instead of through the narrower.
 *   → Block B fails: the reducer's `sync.retireRefused` stays `false` (the
 *     `EMPTY_SYNC` default) because `event.retire_refused` was never on the
 *     narrowed event to begin with.
 *   → Block C fails: the "done" banner prints no honest sentence and no
 *     "N Sources retired" for a normal retirement either — the screen a
 *     person actually watches never distinguishes "refused" from
 *     "nothing was gone".
 *
 * Restore with `git checkout -- features/source-library/contract.ts
 * features/source-library/types.ts`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

import { parseSyncEvent } from "../contract";
import sourceLibraryReducer, { syncEvent, syncRequested } from "../redux/sourceLibrarySlice";
import type { SyncState } from "../redux/sourceLibrarySlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { LibraryMetricsHeader } from "../components/LibraryMetricsHeader";
import type { LibraryRow } from "../types";

/** One `library.sync.completed` payload exactly as aidream `1a18dd0ad1` sends it
 *  when the candidate retirement looked like a reconciliation bug. */
function refusedWireEvent(overrides: Record<string, unknown> = {}) {
    return {
        type: "library.sync.completed",
        operation_id: "op-1",
        library_id: "3a2ddefc-ba06-4722-9d63-00317ca3f8cd",
        seq: 7,
        at: "2026-09-19T00:00:00Z",
        total_listed: 202,
        new_count: 0,
        updated_count: 202,
        removed_count: 0,
        elapsed_ms: 4200,
        quota_units_spent: 3,
        skipped_by_reason: {},
        skipped_total: 0,
        retire_refused: true,
        metrics: {
            total: 202,
            counts_by_kind: { long: 202, short: 0, live: 0, unknown: 0 },
            length: {},
            length_by_kind: {},
            date_range: {},
            caption_coverage: {},
            transcripts: {},
            cadence_per_month: [],
        },
        ...overrides,
    };
}

function libraryRow(): LibraryRow {
    return {
        id: "3a2ddefc-ba06-4722-9d63-00317ca3f8cd",
        organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        adapter: "youtube",
        kind: "channel",
        external_id: "UCAuUUnT6oDeKwE6v1NGQxug",
        uploads_playlist_id: "UUAuUUnT6oDeKwE6v1NGQxug",
        name: "Wait But Why",
        description: null,
        handle: null,
        canonical_url: "https://waitbutwhy.com",
        thumbnail_url: null,
        visibility: "internal",
        item_count: 202,
        sync_status: "idle",
        sync_error: null,
        last_synced_at: "2026-09-19T00:00:00Z",
        last_sync_duration_ms: 4200,
        settings: {},
        metrics: null,
        created_at: "2026-09-17T18:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
        created_by: null,
    };
}

function makeStore() {
    return configureStore({
        reducer: { sourceLibrary: sourceLibraryReducer, appContext: appContextReducer },
    });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: React.ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(<Provider store={makeStore()}>{node}</Provider>);
    });
    return container;
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
});

// ── A ────────────────────────────────────────────────────────────────────────

describe("A · the narrower reads retire_refused off the wire", () => {
    it("a refused retirement narrows to retire_refused: true", () => {
        const standIns: string[] = [];
        const parsed = parseSyncEvent(refusedWireEvent(), standIns);
        expect(parsed).not.toBeNull();
        expect(parsed && "event" in parsed ? parsed.event : null).toMatchObject({
            type: "library.sync.completed",
            removed_count: 0,
            retire_refused: true,
        });
        expect(standIns).toEqual([]);
    });

    it("an older server build that sends neither field reads as not refused", () => {
        const wire = refusedWireEvent();
        delete (wire as Record<string, unknown>).retire_refused;
        const standIns: string[] = [];
        const parsed = parseSyncEvent(wire, standIns);
        expect(parsed && "event" in parsed ? parsed.event : null).toMatchObject({
            retire_refused: false,
        });
    });
});

// ── B ────────────────────────────────────────────────────────────────────────

describe("B · the reducer carries the refusal into the sync slice", () => {
    it("syncEvent sets retireRefused and leaves removedCount at 0", () => {
        let state = sourceLibraryReducer(
            undefined,
            syncRequested({ libraryId: "lib-1", startedAt: 0 }),
        );
        const standIns: string[] = [];
        const parsed = parseSyncEvent(refusedWireEvent(), standIns);
        if (!parsed || !("event" in parsed)) throw new Error("expected a parsed event");
        state = sourceLibraryReducer(
            state,
            syncEvent({ libraryId: "lib-1", event: parsed.event }),
        );
        expect(state.byLibraryId["lib-1"].sync.retireRefused).toBe(true);
        expect(state.byLibraryId["lib-1"].sync.removedCount).toBe(0);
        expect(state.byLibraryId["lib-1"].sync.phase).toBe("done");
    });

    it("a normal retirement sets removedCount with retireRefused false", () => {
        let state = sourceLibraryReducer(
            undefined,
            syncRequested({ libraryId: "lib-2", startedAt: 0 }),
        );
        const standIns: string[] = [];
        const parsed = parseSyncEvent(
            refusedWireEvent({ retire_refused: false, removed_count: 5 }),
            standIns,
        );
        if (!parsed || !("event" in parsed)) throw new Error("expected a parsed event");
        state = sourceLibraryReducer(
            state,
            syncEvent({ libraryId: "lib-2", event: parsed.event }),
        );
        expect(state.byLibraryId["lib-2"].sync.retireRefused).toBe(false);
        expect(state.byLibraryId["lib-2"].sync.removedCount).toBe(5);
    });
});

// ── C ────────────────────────────────────────────────────────────────────────

describe("C · the screen a person watches says which one happened", () => {
    const DONE_SYNC_BASE: SyncState = {
        phase: "done",
        startedAt: 0,
        finishedElapsedMs: 4200,
        listed: 202,
        skippedTotal: 0,
        skippedByReason: {},
        removedCount: 0,
        retireRefused: false,
        expectedTotal: null,
        pagesReceived: 5,
        operationId: "op-1",
        message: null,
        remedy: null,
        retryable: false,
        partialTotal: null,
        quotaUnitsSpent: 3,
        problems: [],
    };

    it("a refused retirement prints the honest sentence, not a bare 0", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={libraryRow()}
                metrics={null}
                sync={{ ...DONE_SYNC_BASE, retireRefused: true, removedCount: 0 }}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).toContain("kept every Source it had");
        expect(node.textContent).toContain("Run the catalogue again later");
        expect(node.textContent).not.toContain("0 Sources retired");
    });

    it("a real retirement is reported as N Sources retired, with no refusal sentence", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={libraryRow()}
                metrics={null}
                sync={{ ...DONE_SYNC_BASE, retireRefused: false, removedCount: 144 }}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).toContain("144 Sources retired");
        expect(node.textContent).not.toContain("kept every Source it had");
    });

    it("an ordinary sync with nothing retired says neither thing", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={libraryRow()}
                metrics={null}
                sync={DONE_SYNC_BASE}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).not.toContain("Sources retired");
        expect(node.textContent).not.toContain("kept every Source it had");
    });
});
