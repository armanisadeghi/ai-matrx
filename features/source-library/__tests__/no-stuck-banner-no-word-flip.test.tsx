/**
 * TWO DEFECTS THE KOTTKE.ORG FIXER NOTE NAMED FOR ROW A2 (FIRST-PERSON-TEST.md,
 * 2026-09-19): a "being catalogued right now" banner that outlives the run it
 * describes, and a metrics-header word that flips between vocabularies while
 * the page is still deciding what kind of Source this Library holds.
 *
 * DEFECT 1 — THE BANNER OUTLIVES THE RUN. `SyncStrip`'s `library.sync_status
 * === "syncing"` branch is a fresh server read, never this tab's own stream —
 * it fires exactly when SOME OTHER run (another tab, a crashed worker, a
 * stalled write) is what the server remembers. Before this fix that state had
 * no ceiling: kottke.org sat on this exact sentence across four separate
 * fresh page loads over two-plus minutes, with the same "reload to see" text
 * every time, because nothing on the client ever questioned how old the claim
 * was. `library.updated_at` is bumped by the very write that flips the row
 * INTO "syncing", so its age is an honest clock on how long the claim has
 * stood — past a generous ceiling, the branch now says the run most likely
 * stalled and offers a real "Try again" button, instead of an unbounded
 * spinner with no remedy.
 *
 * The seam docstring in `SyncStrip` also states, and Block A proves, the
 * ordering this fix depends on: THIS TAB'S OWN "done" phase — the sync slice
 * a completed run in this tab writes to `entry.sync.phase` — is checked
 * BEFORE the server's row is ever consulted, so a completed sync in this
 * session can never be shadowed by a stale `sync_status` on the same row.
 *
 * DEFECT 2 — THE LABEL FLIPS. The "total" tile's label came straight from
 * `vocabulary.item.many`, which defaults to the neutral "Items" while
 * `library` is still null (the row has not arrived) — so a blog's own header
 * read "ITEMS" for a moment and then became "POSTS" once the row landed, and
 * on a build where the row never settled the tile was simply stuck on the
 * wrong word ("the 'ITEMS' tile even changed its own label between loads —
 * 'POSTS' once, 'ITEMS' another time, on the identical Library"). The fix:
 * the label is `null` (a skeleton, the same convention the tile's NUMBER
 * already uses) until the Library's row is known, never the neutral guess.
 *
 * RED PROOFS (run each, do not trust this comment):
 *
 *   R1 — in `LibraryMetricsHeader.tsx`, move the `library?.sync_status ===
 *        "failed"` / `"syncing"` checks in `SyncStrip` above the `running` /
 *        `unavailable` / `failed` / `done` `sync.phase` checks (or delete the
 *        `if (sync.phase === "done")` branch's early return).
 *        → "a completed sync in this tab is never shadowed by a stale
 *          server row" fails: the banner reads "being catalogued right now"
 *          over a Library this tab just finished.
 *
 *   R2 — in `SyncStrip`, delete the `STUCK_THRESHOLD_MS` branch (or hardcode
 *        `stuckForMs !== null && stuckForMs > STUCK_THRESHOLD_MS` to `false`).
 *        → "a syncing row stuck for hours gets a stalled sentence and a
 *          retry, not an unbounded spinner" fails: the ancient `updated_at`
 *          still prints "started somewhere other than this tab. Reload…"
 *          with no way out.
 *
 *   R3 — in `buildTilesFromMetrics`, hardcode the "total" tile's `label` back
 *        to `vocabulary.item.many` (drop the `kindKnown` gate).
 *        → "a blog's total tile never shows the neutral word, not even for
 *          one frame" fails: rendering with `library={null}` prints "Items"
 *          instead of a skeleton.
 *
 * Restore with `git checkout -- features/source-library/components/LibraryMetricsHeader.tsx`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { LibraryMetricsHeader } from "../components/LibraryMetricsHeader";
import type { LibraryMetrics, LibraryRow, MediaAdapter } from "../types";
import type { SyncState } from "../redux/sourceLibrarySlice";

const IDLE_SYNC: SyncState = {
    phase: "idle", startedAt: null, finishedElapsedMs: null, listed: 0,
    expectedTotal: null, pagesReceived: 0, operationId: null, message: null,
    remedy: null, retryable: false, partialTotal: null, quotaUnitsSpent: null, problems: [],
    skippedTotal: 0, skippedByReason: {}, removedCount: 0, retireRefused: false,
};

const DONE_SYNC: SyncState = {
    ...IDLE_SYNC,
    phase: "done",
    finishedElapsedMs: 47000,
    listed: 48258,
};

function library(
    adapter: MediaAdapter,
    overrides: Partial<LibraryRow> = {},
): LibraryRow {
    return {
        id: "11111111-2222-3333-4444-555555555555",
        organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        adapter,
        kind: "channel",
        external_id: "x",
        uploads_playlist_id: null,
        name: "kottke.org",
        description: null,
        handle: null,
        canonical_url: "https://kottke.org",
        thumbnail_url: null,
        visibility: "personal",
        item_count: 48258,
        sync_status: "idle",
        sync_error: null,
        last_synced_at: "2026-09-19T00:00:00Z",
        last_sync_duration_ms: 47000,
        settings: {},
        metrics: null,
        created_at: "2026-09-18T00:00:00Z",
        updated_at: "2026-09-19T00:00:00Z",
        created_by: null,
        ...overrides,
    };
}

function metrics(total: number): LibraryMetrics {
    const zeroLength = { total_seconds: 0, mean_seconds: 0, median_seconds: 0, p90_seconds: 0 };
    return {
        computed_at: "2026-09-19T00:00:00Z",
        library_id: "11111111-2222-3333-4444-555555555555",
        total,
        counts_by_kind: { long: 0, short: 0, live: 0, unknown: total },
        date_range: { earliest: null, latest: null, span_days: null },
        cadence_per_month: [{ period: "2026-01", count: total, seconds: 0 }],
        length: zeroLength,
        length_by_kind: {},
        top_by_views: [],
        engagement: { total_views: 0, total_likes: 0, median_views: 0 },
        caption_coverage: { with_captions: 0, without_captions: 0, unknown: total, coverage_percent: 0 },
        transcripts: { ready: 0, queued: 0, running: 0, failed: 0, none: total },
        stale: false,
    } as unknown as LibraryMetrics;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHeader(props: Partial<React.ComponentProps<typeof LibraryMetricsHeader>>) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(
            <LibraryMetricsHeader
                library={null}
                metrics={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
                {...props}
            />,
        );
    });
    return container;
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
});

describe("A · a completed sync clears the banner", () => {
    it("this tab's own 'done' phase wins over a stale server row on the SAME Library", () => {
        // The server row still says "syncing" — imagine the write that flips
        // it to idle races behind the stream's own terminal event, or simply
        // has not landed yet. This tab watched the run finish, so it knows
        // better than that stale row.
        const node = renderHeader({
            library: library("blog_feed", { sync_status: "syncing" }),
            metrics: metrics(48258),
            sync: DONE_SYNC,
        });
        expect(node.textContent).toContain("Up to date");
        expect(node.textContent).not.toContain("being catalogued right now");
    });

    it("a fresh page load with no run of its own reads the server's idle row honestly", () => {
        const node = renderHeader({
            library: library("blog_feed", { sync_status: "idle" }),
            metrics: metrics(48258),
            sync: IDLE_SYNC,
        });
        expect(node.textContent).not.toContain("being catalogued right now");
        expect(node.textContent).not.toContain("Up to date");
        expect(node.textContent).toContain("Last brought up to date");
    });
});

describe("B · a 'syncing' row that never moves gets a remedy instead of an unbounded spinner", () => {
    it("a recently-started run elsewhere still reads as running, with no false alarm", () => {
        const node = renderHeader({
            library: library("blog_feed", {
                sync_status: "syncing",
                updated_at: new Date(Date.now() - 30_000).toISOString(),
            }),
            metrics: null,
            sync: IDLE_SYNC,
        });
        expect(node.textContent).toContain("being catalogued right now");
        expect(node.textContent).not.toContain("stalled");
        expect(node.textContent).not.toContain("Try again");
    });

    it("a 'syncing' row untouched for hours is named as stalled and offers a real retry", () => {
        const node = renderHeader({
            library: library("blog_feed", {
                sync_status: "syncing",
                updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                item_count: 346,
            }),
            metrics: null,
            sync: IDLE_SYNC,
        });
        expect(node.textContent).not.toContain("started somewhere other than this tab");
        expect(node.textContent).toContain("stalled");
        expect(node.textContent).toContain("346");
        expect(node.textContent).toContain("Try again");
    });
});

describe("C · a Library of kind blog never renders 'POSTS' then 'ITEMS' — nor the reverse", () => {
    it("the total tile shows a skeleton, never the neutral word, while the Library's row is unknown", () => {
        const node = renderHeader({ library: null, metrics: null, sync: IDLE_SYNC });
        expect(node.textContent).not.toContain("Items");
        expect(node.textContent).not.toContain("ITEMS");
        expect(node.textContent).not.toContain("Posts");
    });

    it("once the row is known, the label is already the real word — no flip observed", () => {
        const node = renderHeader({
            library: library("blog_feed"),
            metrics: metrics(48258),
            sync: IDLE_SYNC,
        });
        expect(node.textContent).toContain("Posts");
        expect(node.textContent).not.toContain("Items");
    });

    it("the cadence chart title carries the same rule as the total tile", () => {
        const unknown = renderHeader({ library: null, metrics: null, sync: IDLE_SYNC });
        expect(unknown.textContent).not.toContain("Added, by month");
        act(() => root?.unmount());
        container?.remove();

        const known = renderHeader({
            library: library("blog_feed"),
            metrics: metrics(48258),
            sync: IDLE_SYNC,
        });
        expect(known.textContent).toContain("Publishing cadence, by month");
    });
});
