/**
 * THE GUARD for D5 (jobs-bar cold-walk-12, 2026-09-19): a failed Library-ROW
 * read must never render as "This Library has never been brought up to
 * date." — that sentence is a claim about the row, and a failed read proves
 * nothing about it either way.
 *
 * ## The defect, as the cold walk hit it
 *
 * The console recorded a CORS-blocked `GET .../media/libraries/{id}` from
 * `acquisition-frontier.localhost:3001`. On screen, the freshness banner then
 * read "This Library has never been brought up to date." directly above its
 * own stat block reading "507 Episodes / Catalogued in this Library" —
 * computed moments earlier by a DIFFERENT, successful call
 * (`GET …/metrics`). Minutes earlier the same banner had correctly read "Last
 * brought up to date 9/19/2026, 9:12:06 PM, in 3.2s." A failed read of one
 * field was rendered as the empty, honest-sounding answer to a question
 * nobody had actually managed to ask.
 *
 * Two root causes, both closed here:
 *   1. The "still syncing" poll in `LibraryPage.tsx` swallowed every read
 *      failure with a comment claiming the mount read's `loadError` already
 *      covered it — true only of the mount read itself.
 *   2. `sourceLibrarySlice.ts`'s `library.sync.completed` case flips
 *      `sync_status` away from `"syncing"` but never set `last_synced_at`, so
 *      a Library that had never been read by `GET` before finishing its
 *      first sync had nothing to fall back on the instant the row read that
 *      would have supplied it failed.
 *
 * ## The SUT and what is real
 *
 * `LibraryPage` + `LibraryMetricsHeader`, real `sourceLibrarySlice` and real
 * `appContextSlice`, following the harness in
 * `not-yet-is-not-a-failure.test.tsx`. Doubles: the `../api` module (the
 * network boundary under test) and the surrounding list shell / router /
 * action registry / job discovery, none of which this defect concerns.
 *
 * ## Proven red before the fix (2026-09-19)
 *
 * Against the pre-fix files, "a failed row poll never claims the Library has
 * never synced" fails: the banner prints the false sentence.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const getLibrary = jest.fn();
const getLibraryMetrics = jest.fn();
const listLibraryJobs = jest.fn();

jest.mock("../api", () => {
    const actual = jest.requireActual("../api");
    return {
        ...actual,
        getLibrary: (...args: unknown[]) => getLibrary(...args),
        getLibraryMetrics: (...args: unknown[]) => getLibraryMetrics(...args),
        listLibraryJobs: (...args: unknown[]) => listLibraryJobs(...args),
    };
});

jest.mock("@/lib/entity-list/components/EntityListPage", () => ({
    __esModule: true,
    EntityListPage: (props: { notice?: React.ReactNode }) => (
        <div data-testid="list-shell">{props.notice}</div>
    ),
}));
jest.mock("@/features/shell/components/header/PageHeader", () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/libraries/9978e2a8-71d1-40e2-80da-c0243dd1baab",
}));
// The access gate's platform resolver is a network RPC. Answered FROM the
// read hint exactly as the real one does: a transient fault on a Library the
// person owns comes back `ok` ("you do have access — try again"). A plain
// function, so the suite's resetAllMocks cannot strip it.
jest.mock("@/features/access-gate/service/accessDeniedContext", () => ({
    fetchAccessDeniedContext: async (
        token: string,
        _id: string,
        read: "access-question" | "fault",
    ) => ({
        status: read === "fault" ? "ok" : "missing",
        disclosure: "full",
        level: read === "fault" ? "admin" : "none",
        isOwner: read === "fault",
        entity: { token, label: "Library", title: "The Bike Shed" },
        owner: null,
        organization: null,
        ancestor: null,
        request: null,
        canRequest: false,
    }),
}));
jest.mock("../hooks/useActionRegistry", () => ({
    __esModule: true,
    useActionRegistry: () => ({ actions: [], error: null, remedy: null, reload: jest.fn() }),
}));
jest.mock("../hooks/useActionRunner", () => ({
    __esModule: true,
    useActionRunner: () => ({ bulkActions: [], dialog: null }),
}));
// The REAL `useLibrarySync` is used here (unlike the not-yet-is-not-a-failure
// suite) because this defect's second root cause lives inside its reducer's
// stream-event handling — a stub sync hook would hide it entirely.

import sourceLibraryReducer, { syncEvent, syncRequested } from "../redux/sourceLibrarySlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { LibraryPage } from "../components/LibraryPage";
import { MediaApiError } from "../api";

function mediaError(message: string, code: string, status?: number) {
    return new MediaApiError({ message, code, remedy: null, retryable: false }, status);
}

const LIBRARY_ID = "9978e2a8-71d1-40e2-80da-c0243dd1baab";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

const CORS_BLOCKED = () =>
    mediaError(
        "The connection to the server dropped before this Library could be read.",
        "network_error",
    );

const libraryRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: LIBRARY_ID,
    name: "The Bike Shed",
    handle: "@bikeshed",
    sync_status: "idle",
    sync_error: null,
    item_count: 507,
    last_synced_at: null,
    last_sync_duration_ms: null,
    metrics: null,
    canonical_url: "https://feeds.fireside.fm/bikeshed/rss",
    ...overrides,
});

const metricsPayload = () => ({
    value: {
        computed_at: "2026-09-19T21:16:59Z",
        library_id: LIBRARY_ID,
        total: 507,
        counts_by_kind: { long: 507, short: 0, live: 0, unknown: 0 },
        date_range: { earliest: null, latest: null, span_days: null },
        cadence_per_month: [],
        length: { total_seconds: 1, mean_seconds: 1, median_seconds: 1, p90_seconds: 1 },
        length_by_kind: {},
        top_by_views: [],
        engagement: { total_views: 0, total_likes: 0, median_views: 0 },
        caption_coverage: { with_captions: 0, without_captions: 0, unknown: 0, coverage_percent: 0 },
        transcripts: { ready: 0, queued: 0, running: 0, failed: 0, none: 507 },
        stale: false,
    },
    problems: [] as string[],
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let store: ReturnType<typeof makeStore>;

function makeStore() {
    return configureStore({
        reducer: { sourceLibrary: sourceLibraryReducer, appContext: appContextReducer },
        preloadedState: {
            appContext: { organization_id: ORG } as never,
        },
    });
}

async function mount() {
    store = makeStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <Provider store={store}>
                <LibraryPage libraryId={LIBRARY_ID} />
            </Provider>,
        );
    });
    return container;
}

async function settle() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    jest.resetAllMocks();
});

const NEVER_SYNCED = "This Library has never been brought up to date.";
const COULD_NOT_CHECK = "We could not check whether this Library has been brought up to date";

// Since 2026-09-24 a Library whose row cannot be read, with none held, hands
// the page to the canonical access gate (LibraryPage: "the one thing this page
// is about is unavailable"), which tells denied / deleted / missing / fault
// apart. D5's law is unchanged: a failed read is never "never synced".
const GATE_FAULT = "You do have access to it — something went wrong on our side.";

it("a failed row read never claims the Library has never synced — the gate says the read failed", async () => {
    // The row read fails (the CORS block the walk recorded); metrics succeeds
    // independently, exactly as it did live.
    getLibrary.mockRejectedValue(CORS_BLOCKED());
    getLibraryMetrics.mockResolvedValue(metricsPayload());
    listLibraryJobs.mockResolvedValue({ jobs: [], row_problems: [] });

    const node = await mount();
    await settle();

    expect(node.textContent).not.toContain(NEVER_SYNCED);
    expect(node.textContent).toContain(GATE_FAULT);
    const retry = Array.from(node.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("Try again"),
    );
    expect(retry).toBeDefined();
});

it("Try again on the gate re-runs the row read and draws the Library with its real freshness", async () => {
    getLibrary.mockRejectedValueOnce(CORS_BLOCKED());
    getLibraryMetrics.mockResolvedValue(metricsPayload());
    listLibraryJobs.mockResolvedValue({ jobs: [], row_problems: [] });

    const node = await mount();
    await settle();
    expect(node.textContent).toContain(GATE_FAULT);

    getLibrary.mockResolvedValueOnce(
        libraryRow({ last_synced_at: "2026-09-19T21:12:06Z", last_sync_duration_ms: 3200 }),
    );
    const retry = Array.from(node.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("Try again"),
    );
    await act(async () => {
        retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();

    expect(getLibrary).toHaveBeenCalledTimes(2);
    expect(node.textContent).not.toContain(GATE_FAULT);
    expect(node.textContent).not.toContain(COULD_NOT_CHECK);
    expect(node.textContent).not.toContain(NEVER_SYNCED);
    expect(node.textContent).toContain("Last brought up to date");
    expect(node.textContent).toContain("Catalogued in this Library");
});

it("a failed 'still syncing' poll is recorded, never swallowed — the held Library stays and says the read failed", async () => {
    // D5 root cause 1: the poll's catch swallowed every failure. The mount read
    // succeeds with a row mid-run elsewhere; the poll that follows is blocked.
    const intervals: Array<() => void> = [];
    const setIntervalSpy = jest
        .spyOn(window, "setInterval")
        .mockImplementation(((fn: () => void) => {
            intervals.push(fn);
            return intervals.length as unknown as ReturnType<typeof setInterval>;
        }) as typeof window.setInterval);
    try {
        getLibrary.mockResolvedValueOnce(libraryRow({ sync_status: "syncing" }));
        getLibraryMetrics.mockResolvedValue(metricsPayload());
        listLibraryJobs.mockResolvedValue({ jobs: [], row_problems: [] });

        const node = await mount();
        await settle();
        expect(intervals.length).toBeGreaterThan(0);

        getLibrary.mockRejectedValueOnce(CORS_BLOCKED());
        await act(async () => {
            intervals.forEach((tick) => tick());
        });
        await settle();

        expect(getLibrary).toHaveBeenCalledTimes(2);
        expect(node.textContent).toContain(
            "The connection to the server dropped before this Library could be read.",
        );
        expect(node.textContent).not.toContain(NEVER_SYNCED);
        // The held row is kept: a failed poll is not a gate.
        expect(node.textContent).not.toContain(GATE_FAULT);
        expect(node.textContent).toContain("The Bike Shed");
    } finally {
        setIntervalSpy.mockRestore();
    }
});

it("a completed sync sets last_synced_at locally, so it never reads as never-synced the instant it finishes", async () => {
    // A brand-new Library (`?sync=1` straight from the paste box): the row
    // read succeeds but `last_synced_at` is genuinely null — nothing has
    // finished yet. This is the exact shape that exposed the second root
    // cause: `library.sync.completed` flipped `sync_status` away from
    // "syncing" but never touched `last_synced_at`, so the freshness banner
    // had nothing to show the instant the run this tab just watched finished.
    getLibrary.mockResolvedValue(libraryRow({ sync_status: "syncing" }));
    getLibraryMetrics.mockResolvedValue(metricsPayload());
    listLibraryJobs.mockResolvedValue({ jobs: [], row_problems: [] });

    await mount();
    await settle();

    await act(async () => {
        store.dispatch(syncRequested({ libraryId: LIBRARY_ID, startedAt: Date.now() }));
        store.dispatch(
            syncEvent({
                libraryId: LIBRARY_ID,
                event: {
                    type: "library.sync.completed",
                    total_listed: 507,
                    new_count: 507,
                    updated_count: 0,
                    removed_count: 0,
                    elapsed_ms: 3200,
                    quota_units_spent: 1,
                    metrics: metricsPayload().value,
                    skipped_by_reason: {},
                    skipped_total: 0,
                    retire_refused: false,
                } as never,
            }),
        );
    });
    await settle();

    const state = store.getState();
    expect(state.sourceLibrary.byLibraryId[LIBRARY_ID]?.library?.last_synced_at).not.toBeNull();
});
