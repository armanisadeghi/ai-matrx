/**
 * THE GUARD for the shape-shift class, closed here the way it was closed in
 * `features/exports`.
 *
 * WHAT BROKE, AND WHERE. On 2026-09-17 production's
 * `GET /media/export-adapters` answered with `recognised_not_readable` as a
 * LIST of `{label, block}` objects where the client's interface said `number`.
 * The fetch layer asserted the body with a generic type parameter — a promise,
 * not a check — and the component put the value straight into a JSX child
 * position, so React threw "Objects are not valid as a React child (found:
 * object with keys {label, block})" and `/exports` fell to the global error
 * boundary on EVERY load.
 *
 * The census of that defect found it unfixed in this feature: `api.ts`'s
 * `unwrap<T>()` was `return result.data as T`, the return path of nearly every
 * function in the file, and `JobPanel` renders `item.title`, `item.external_id`
 * and `item.attempt` straight into JSX. Two things follow from that, and this
 * file proves both.
 *
 * WHY IT CANNOT GO GREEN ON A LIE (`forcing-function-tests`):
 *   • Only the TRANSPORT is stubbed — `@/lib/api/call-api`, the one module
 *     that speaks HTTP. The real `getJob`, the real `contract.ts` parsers, the
 *     real `useJob`, the real Redux slice, the real `JobPanel` and the real
 *     React DOM renderer all run, so this fails exactly when a person watching
 *     a job would see the crash, and for the same reason.
 *   • The payloads are the CONTRACT's own rows with ONE field shape-shifted
 *     the way the live server shape-shifted one: a scalar that became an
 *     object, and a scalar that became a list.
 *   • What it asserts is what a PERSON sees: the panel's own text. jsdom lays
 *     nothing out, so the item list's virtualizer measures zero and mounts no
 *     item rows here — which is why every assertion below is about the panel's
 *     sentences and numbers rather than a row's innerText.
 *
 * RED PROOF (run it, do not trust this comment):
 *     git show HEAD:features/source-library/api.ts > features/source-library/api.ts
 *     npx jest features/source-library/__tests__/unreadable-shapes.test.tsx
 *   → with the cast back in place, block A dies inside React with
 *     "Objects are not valid as a React child (found: object with keys {label,
 *     block})" — the 2026-09-17 crash, on this screen. Restore with
 *     `git checkout -- features/source-library/api.ts`. Block B is proved the
 *     same way against `parseSyncEvent`'s `number()` narrowing: take it out and
 *     the shape-shifted `cumulative` comes back as an event instead of a named
 *     problem. (Block B moved from the job stream to the sync stream on
 *     2026-09-18 — see its own note for why.)
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

// ── The transport, and ONLY the transport, is faked ──────────────────────────

interface FakeCall {
    path: string;
    method: string;
    stream?: boolean;
    onStreamEvent?: (event: { event: string; data?: unknown }) => void;
}

const transport = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
    __esModule: true,
    // `callApi` is a thunk creator; the store's own thunk middleware runs it,
    // exactly as it does in the app.
    callApi: (config: FakeCall) => () => transport(config),
}));

import sourceLibraryReducer from "../redux/sourceLibrarySlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { JobPanel } from "../components/JobPanel";
import { asSyncEvent } from "../api";

function makeStore() {
    return configureStore({
        reducer: { sourceLibrary: sourceLibraryReducer, appContext: appContextReducer },
        middleware: (getDefault) => getDefault({ serializableCheck: false }),
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
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
});

function text(): string {
    return container?.textContent ?? "";
}

// ── The contract's own rows (§7.4, §7.5) ─────────────────────────────────────

const JOB = {
    id: "job-7",
    library_id: "lib-1",
    organization_id: "org-1",
    action: "transcribe",
    name: "Transcribe 3 videos",
    status: "running",
    parallelism: 8,
    allow_paid: true,
    totals: { total: 3, queued: 1, running: 1, succeeded: 1, failed: 0, skipped: 0 },
    lane_totals: { free_captions: 2, paid_agent: 1 },
    estimate: null,
    estimate_confirmed_at: null,
    progress_percent: 33,
    error: null,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    created_at: new Date(Date.now() - 61_000).toISOString(),
    operation_id: "op-1",
};

function item(overrides: Record<string, unknown>) {
    return {
        id: "i1",
        job_id: "job-7",
        video_id: "v1",
        external_id: "abc",
        title: "The first video",
        lane: "free_captions",
        status: "succeeded",
        attempt: 1,
        error: null,
        retryable: false,
        result: null,
        started_at: null,
        completed_at: null,
        ...overrides,
    };
}

// ═══════════════════════════════ A ═══════════════════════════════════════════

describe("A · a field that changed shape on the wire never reaches React", () => {
    /**
     * 🚨 CLASS FIX, 2026-09-18. This used to assert the WHOLE panel fell to an
     * error state ("Read it again") the moment ONE item's field shape-shifted
     * — the same all-or-nothing bug `mapListRows` (`lib/contract/narrow.ts`)
     * closed for the Jobs lane list itself (commit 509e2bffb5) and, the same
     * day, for `features/exports`. `parseJobDetailResponse` now drops only the
     * unreadable item and keeps every sibling item that DID read — proven
     * here by item i1 staying on screen beside the named problem for i2.
     */
    it("drops one unreadable item and names it, but keeps every item that reads fine", async () => {
        // THE 2026-09-17 SHAPE-SHIFT, on this screen's rows: a scalar the
        // client renders as a JSX child arrives as an object.
        transport.mockResolvedValue({
            data: {
                job: JOB,
                items: [
                    item({ id: "i1", title: "The first video" }),
                    item({
                        id: "i2",
                        video_id: "v2",
                        title: { label: "Rebuilding the index", block: "not readable yet" },
                    }),
                ],
                items_total: 2,
            },
        });

        mount(<JobPanel jobId="job-7" />);
        await flush();

        // The screen is up — React did not throw, the panel painted its header.
        expect(container!.querySelector("h2")).not.toBeNull();
        // The sibling item that DID read survived being next to the broken one:
        // two items came in, one was unreadable, and this panel still holds
        // ONE — never zero, the all-or-nothing outcome the old code gave.
        // (jsdom's virtualizer measures zero height and mounts no item rows,
        // so this reads the panel's own read-count sentence, not a row's text
        // — see this file's header comment.)
        expect(text()).toContain("Showing the 1 items this panel has read");
        // And the panel says, in words, exactly which field it could not read —
        // named beside the good item, never taking it down with it.
        expect(text()).toContain("items[1].title");
        expect(text()).toContain("an object with keys {label, block}");
        expect(text()).toContain("Nothing has been guessed or hidden");
        // The object that used to reach React as a child is nowhere in the DOM.
        expect(text()).not.toContain("[object Object]");
        // This is NOT the panel-level "the whole read failed" door: the read
        // succeeded, one row within it did not.
        expect(
            Array.from(container!.querySelectorAll("button")).some((button) =>
                (button.textContent ?? "").includes("Read it again"),
            ),
        ).toBe(false);
    });

    it("a count that became a list is named too, never rendered", async () => {
        // The verbatim `/exports` mutation — a number that arrived as a list of
        // objects — applied to the number this panel reads aloud.
        transport.mockResolvedValue({
            data: {
                job: { ...JOB, progress_percent: [{ label: "33%", block: null }] },
                items: [item({})],
                items_total: 1,
            },
        });

        mount(<JobPanel jobId="job-7" />);
        await flush();

        expect(text()).toContain("job.progress_percent");
        expect(text()).toContain("a list of 1 entry");
        expect(text()).not.toContain("[object Object]");
    });

    it("a job the server sent as promised is untouched by any of this", async () => {
        transport.mockResolvedValue({
            data: { job: JOB, items: [item({})], items_total: 1 },
        });

        mount(<JobPanel jobId="job-7" />);
        await flush();

        expect(text()).toContain("Transcribe 3 videos");
        expect(text()).toContain("33%");
        expect(text()).toContain("Succeeded");
        expect(text()).not.toContain("cannot read");
    });
});

// ═══════════════════════════════ B ═══════════════════════════════════════════

describe("B · a malformed update never takes down a running SYNC", () => {
    /**
     * 🚨 THIS BLOCK MOVED FROM THE JOB STREAM TO THE SYNC STREAM (2026-09-18),
     * because the job stream never existed. `GET /media/jobs/{id}/stream` is
     * published in API-CONTRACT.md §7 but is marked `implemented: False` in
     * the server's own wire table and is absent from the live contract, so the
     * old version of this block fed a stub transport events that no server
     * has ever sent — a test proving its author's own fixture, which is the
     * defect `forcing-function-tests` names. The enumeration stream
     * (`POST /media/libraries/{id}/sync`) is real, measured at 11 streamed
     * pages over 533 videos, and it carries the SAME law: one update this
     * build cannot read never takes the reader down, and is named rather than
     * swallowed. `asSyncEvent` is the real narrowing the real reader calls;
     * only the envelope around it is constructed here.
     */
    const page = (overrides: Record<string, unknown> = {}) => ({
        event: "data" as const,
        data: {
            type: "library.sync.page",
            library_id: "lib-1",
            at: new Date().toISOString(),
            page_index: 0,
            page_size: 50,
            videos: [],
            cumulative: 50,
            next_page_token_present: true,
            ...overrides,
        },
    });

    it("keeps reading, and says which field it dropped", () => {
        const problems: string[] = [];
        // `cumulative` is a count the screen prints. It arrives as an object —
        // the verbatim 2026-09-17 mutation, on the stream that exists.
        const dropped = asSyncEvent(
            page({ cumulative: { label: "50", block: null } }) as never,
            (message) => problems.push(message),
        );
        expect(dropped).toBeNull();
        expect(problems.join(" ")).toContain("library.sync.page.cumulative");
        expect(problems.join(" ")).not.toContain("[object Object]");

        // The very next event is good, and it still reads — the reader was
        // never torn down.
        const good = asSyncEvent(page() as never, (message) => problems.push(message));
        expect(good).not.toBeNull();
        expect(good!.type).toBe("library.sync.page");
    });

    it("an event this build has never heard of is simply ignored", () => {
        const problems: string[] = [];
        const unknown = asSyncEvent(
            { event: "data", data: { type: "library.teleported" } } as never,
            (message) => problems.push(message),
        );
        // Unknown traffic is not a problem and must not be reported as one.
        expect(unknown).toBeNull();
        expect(problems).toHaveLength(0);
    });
});
