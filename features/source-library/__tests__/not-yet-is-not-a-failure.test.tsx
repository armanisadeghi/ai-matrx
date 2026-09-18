/**
 * THE ORGANIZATION RESOLVES A BEAT LATE, AND THAT IS NOT A FAILURE.
 *
 * The platform transport is fail-closed: an authenticated request made before
 * `appContext.organization_id` resolves is refused with
 * `organization_context_required` — "Select an organization before sending
 * this request." On a cold page load the FIRST read always trips it and the
 * second read succeeds, so for years that refusal was swallowed and nobody
 * noticed. When this screen stopped swallowing metrics errors (so a Library
 * whose catalogue had failed would stop pulsing forever), it started RECORDING
 * that refusal instead — and an independent re-test on 2026-09-18 watched the
 * sentence sit on a healthy Library page for an entire visit, because the
 * successful read behind it had no way to overrule a failure already written.
 *
 * Both halves matter and both are held here: a not-yet never becomes a
 * sentence, AND a stale answer never overwrites a newer one. A REAL failure
 * must still speak — that is the whole reason the swallow was removed.
 *
 * RED PROOFS (run any and the named block fails):
 *
 *   J1 — in `components/LibraryPage.tsx`, delete `if (!organizationId) return;`
 *        from `refreshMetrics`.
 *        → "nothing is asked of the server before there is an organization to
 *          ask with" fails: the read fires with no organization.
 *
 *   J2 — delete the `isOrganizationNotReady(error)` branch in the same catch.
 *        → "the transport's own not-yet never becomes a sentence" fails with
 *          the exact copy the re-test saw.
 *
 *   J3 — delete `if (attempt !== metricsAttemptRef.current) return;` from the
 *        catch.
 *        → "a failure that started earlier cannot replace the one on screen
 *          now" fails: a read from before answers last and overwrites the
 *          sentence a person is currently reading.
 *
 *   J4 — put `catch {}` back around the metrics read.
 *        → "a real failure still says so" fails, which is the defect this
 *          screen was fixed for in the first place.
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

jest.mock("../api", () => {
    const actual = jest.requireActual("../api");
    return {
        ...actual,
        getLibrary: (...args: unknown[]) => getLibrary(...args),
        getLibraryMetrics: (...args: unknown[]) => getLibraryMetrics(...args),
    };
});

// The list shell belongs to another feature and is not under test — but its
// `notice` slot IS where the real metrics header renders, so it is passed
// straight through rather than stubbed away.
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
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock("../hooks/useActionRegistry", () => ({
    __esModule: true,
    useActionRegistry: () => ({ actions: [], error: null, remedy: null, reload: jest.fn() }),
}));
jest.mock("../hooks/useActionRunner", () => ({
    __esModule: true,
    useActionRunner: () => ({ bulkActions: [], dialog: null }),
}));
jest.mock("../hooks/useLibrarySync", () => ({
    __esModule: true,
    useLibrarySync: () => ({
        sync: {
            phase: "idle", startedAt: null, finishedElapsedMs: null, listed: 0,
            expectedTotal: null, pagesReceived: 0, operationId: null, message: null,
            remedy: null, retryable: false, partialTotal: null, quotaUnitsSpent: null,
        },
        elapsedMs: 0,
        isRunning: false,
        start: jest.fn(),
        cancel: jest.fn(),
        dismiss: jest.fn(),
    }),
}));

import sourceLibraryReducer from "../redux/sourceLibrarySlice";
import appContextReducer, {
    setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { LibraryPage } from "../components/LibraryPage";
import { MediaApiError } from "../api";

/**
 * The REAL error class, because both the screen and `isOrganizationNotReady`
 * narrow with `instanceof` — a look-alike would sail past every branch under
 * test and prove nothing.
 */
function mediaError(message: string, code: string, status?: number) {
    return new MediaApiError({ message, code, remedy: null, retryable: false }, status);
}

const LIBRARY_ID = "9978e2a8-71d1-40e2-80da-c0243dd1baab";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const OTHER_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

/** Exactly what the transport hands a caller before the org has resolved. */
const notYet = () =>
    mediaError(
        "Select an organization before sending this request.",
        "organization_context_required",
    );

const metricsPayload = () => ({
    value: {
        computed_at: "2026-09-18T00:00:00Z",
        library_id: LIBRARY_ID,
        total: 950,
        counts_by_kind: { long: 900, short: 50, live: 0, unknown: 0 },
        date_range: { earliest: null, latest: null, span_days: null },
        cadence_per_month: [],
        length: { total_seconds: 1, mean_seconds: 1, median_seconds: 1, p90_seconds: 1 },
        length_by_kind: {},
        top_by_views: [],
        engagement: { total_views: 0, total_likes: 0, median_views: 0 },
        caption_coverage: { with_captions: 0, without_captions: 0, unknown: 0, coverage_percent: 0 },
        transcripts: { ready: 0, queued: 0, running: 0, failed: 0, none: 950 },
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
    });
}

async function mountWithoutOrganization() {
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

async function resolveOrganization() {
    await act(async () => {
        store.dispatch(setOrganization({ id: ORG, name: "admin's Workspace" }));
    });
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    jest.resetAllMocks();
});

const SENTENCE = "Select an organization before sending this request.";

describe("K · a cold load asks nothing until it has an organization to ask with", () => {
    it("nothing is asked of the server before there is an organization to ask with", async () => {
        getLibrary.mockRejectedValue(notYet());
        getLibraryMetrics.mockRejectedValue(notYet());

        const node = await mountWithoutOrganization();

        expect(getLibraryMetrics).not.toHaveBeenCalled();
        expect(getLibrary).not.toHaveBeenCalled();
        expect(node.textContent).not.toContain(SENTENCE);
    });

    it("the read happens the moment the organization lands", async () => {
        getLibrary.mockResolvedValue({
            id: LIBRARY_ID, name: "Good Mythical Morning", handle: "@gmm",
            sync_status: "idle", sync_error: null, item_count: 950,
            last_synced_at: "2026-09-18T00:00:00Z", last_sync_duration_ms: 1000,
            metrics: null, canonical_url: "https://youtube.com/@gmm",
        });
        getLibraryMetrics.mockResolvedValue(metricsPayload());

        const node = await mountWithoutOrganization();
        await resolveOrganization();

        expect(getLibraryMetrics).toHaveBeenCalled();
        expect(node.textContent).not.toContain(SENTENCE);
        expect(node.textContent).toContain("Catalogued in this Library");
    });

    it("the transport's own not-yet never becomes a sentence", async () => {
        // The gate is deliberately bypassed here — the org IS set, and the
        // transport refuses anyway (a real race the gate cannot close).
        getLibrary.mockRejectedValue(notYet());
        getLibraryMetrics.mockRejectedValue(notYet());

        const node = await mountWithoutOrganization();
        await resolveOrganization();

        expect(getLibraryMetrics).toHaveBeenCalled();
        expect(node.textContent).not.toContain(SENTENCE);
        expect(node.textContent).not.toContain("Try the numbers again");
    });
});

describe("L · three consecutive reads in one session, and the newest one wins", () => {
    it("a stale answer cannot overwrite a newer one", async () => {
        getLibrary.mockResolvedValue({
            id: LIBRARY_ID, name: "Good Mythical Morning", handle: "@gmm",
            sync_status: "idle", sync_error: null, item_count: 950,
            last_synced_at: null, last_sync_duration_ms: null, metrics: null,
            canonical_url: "https://youtube.com/@gmm",
        });

        // Read 1 fails at once, so the retry control is on screen and reads 2
        // and 3 can be started the way a person would start them.
        let rejectSecond: (e: unknown) => void = () => {};
        getLibraryMetrics
            .mockImplementationOnce(() =>
                Promise.reject(mediaError("the first read failed", "network_error")),
            )
            .mockImplementationOnce(() => new Promise((_r, rej) => { rejectSecond = rej; }))
            .mockImplementationOnce(() => Promise.resolve(metricsPayload()));

        const node = await mountWithoutOrganization();
        await resolveOrganization();
        expect(node.textContent).toContain("the first read failed");

        const retry = () =>
            [...node.querySelectorAll("button")].find((btn) =>
                (btn.textContent ?? "").includes("Try the numbers again"),
            )!;

        await act(async () => {
            retry().dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            retry().dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        // Read 3 (the newest) has succeeded. Read 2 now fails, late.
        await act(async () => {
            rejectSecond(mediaError("a stale read, arriving late", "network_error"));
            await Promise.resolve();
        });

        expect(getLibraryMetrics).toHaveBeenCalledTimes(3);
        expect(node.textContent).toContain("Catalogued in this Library");
        expect(node.textContent).not.toContain("arriving late");
        expect(node.textContent).not.toContain("the first read failed");
    });

    it("a failure that started earlier cannot replace the one on screen now", async () => {
        // The header hides a metrics error once numbers exist, so the ordering
        // only becomes visible when NOTHING loads: two failures in flight, and
        // the older one answering last. A person must read the newest truth.
        getLibrary.mockResolvedValue({
            id: LIBRARY_ID, name: "TED", handle: "@ted", sync_status: "idle",
            sync_error: null, item_count: 5810, last_synced_at: null,
            last_sync_duration_ms: null, metrics: null,
            canonical_url: "https://youtube.com/@ted",
        });

        let rejectOlder: (e: unknown) => void = () => {};
        getLibraryMetrics
            .mockImplementationOnce(() => new Promise((_r, rej) => { rejectOlder = rej; }))
            .mockImplementationOnce(() =>
                Promise.reject(mediaError("the newest read failed", "network_error")),
            );

        const node = await mountWithoutOrganization();
        await resolveOrganization();                       // read 1, still in flight
        await act(async () => {                            // an org switch — read 2
            store.dispatch(setOrganization({ id: OTHER_ORG, name: "another workspace" }));
        });
        expect(node.textContent).toContain("the newest read failed");

        await act(async () => {
            rejectOlder(mediaError("a read from before, answering last", "network_error"));
            await Promise.resolve();
        });

        expect(getLibraryMetrics).toHaveBeenCalledTimes(2);
        expect(node.textContent).toContain("the newest read failed");
        expect(node.textContent).not.toContain("answering last");
    });
});

describe("M · a real failure still says so", () => {
    it("a metrics read that genuinely failed prints its sentence and a retry", async () => {
        getLibrary.mockResolvedValue({
            id: LIBRARY_ID, name: "TED", handle: "@ted", sync_status: "idle",
            sync_error: null, item_count: 5810, last_synced_at: null,
            last_sync_duration_ms: null, metrics: null,
            canonical_url: "https://youtube.com/@ted",
        });
        getLibraryMetrics.mockRejectedValue(
            mediaError("Connection timed out after 15000ms", "network_error"),
        );

        const node = await mountWithoutOrganization();
        await resolveOrganization();

        expect(node.textContent).toContain("Connection timed out after 15000ms");
        expect(node.textContent).toContain("Try the numbers again");
    });
});
