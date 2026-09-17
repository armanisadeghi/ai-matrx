/**
 * THE THREE LAWS OF THIS SCREEN, EACH PROVEN FAILING BEFORE IT PASSED.
 *
 * These are not "does the component render" tests. Each block asserts one
 * promise the feature makes to a person, and each was watched go RED against a
 * deliberate mutation of the real implementation before it was allowed to pass.
 * The mutations are written down beside each block so the next agent can repeat
 * them in thirty seconds.
 *
 * What is faked here is the SERVER — `../api`, the one module that speaks HTTP.
 * Everything under test is the real thing: the real `useActionRunner`, the real
 * `ActionRunDialog` rendered into a real DOM, the real `useJob`, the real
 * `useActionRegistry`, and the real Redux slice behind them. A test that stubbed
 * the hooks and asserted its own stubs would prove nothing, which is the point
 * of `.claude/skills/forcing-function-tests`.
 *
 * RED PROOFS (run any of these and the named block fails):
 *
 *   A · estimate-before-spend — in `hooks/useActionRunner.tsx`, make `run`
 *       call `createJob` directly instead of `open(action, selection)`.
 *       → "no job is created before a person has seen the cost" fails:
 *         createJob is called with 0 prior estimate calls.
 *       Or drop `estimate_token: estimate?.estimate_token ?? null` from
 *       `confirmRun`'s body → "the confirmed job carries the estimate's token"
 *       fails, and the server would refuse it with `estimate_required`.
 *
 *   B · job state restored on mount — in `hooks/useJob.ts`, delete the
 *       `void reload()` mount effect (or gate the stream effect on anything
 *       other than `live?.loadedFromServer`).
 *       → "a job panel is correct on mount, before any event arrives" fails:
 *         the hook reports 0 items and `loaded: false` for a job the server
 *         already holds 3 items of, which is exactly what a reload mid-job
 *         would show a person.
 *
 *   C · actions come from the registry — add ANY hardcoded action to
 *       `useActionRunner`'s `bulkActions` (a fallback "Transcribe", a default
 *       list when the registry is empty).
 *       → "a registry that answers nothing produces no buttons" fails.
 *       Or filter `actions` by a known-key allow-list →
 *         "an Action this code has never heard of still renders" fails.
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

// ── The server, and only the server, is faked ────────────────────────────────

const estimateAction = jest.fn();
const createJob = jest.fn();
const listActions = jest.fn();
const getJob = jest.fn();
const streamJob = jest.fn();

class FakeMediaApiError extends Error {
    remedy: string | null = null;
    status: number | undefined;
    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

jest.mock("../api", () => ({
    __esModule: true,
    MediaApiError: class extends Error {
        remedy: string | null = null;
        status: number | undefined;
    },
    estimateAction: (...args: unknown[]) => estimateAction(...args),
    createJob: (...args: unknown[]) => createJob(...args),
    listActions: (...args: unknown[]) => listActions(...args),
    getJob: (...args: unknown[]) => getJob(...args),
    streamJob: (...args: unknown[]) => streamJob(...args),
    resumeJob: jest.fn(),
    retryFailedJobItems: jest.fn(),
    cancelJob: jest.fn(),
}));

// The Rulebook picker reaches into another feature's Supabase reads; this
// screen's laws are not about it, and it renders only for one Action's schema.
jest.mock("../components/RulebookParamPicker", () => ({
    __esModule: true,
    RulebookParamPicker: () => null,
}));

import sourceLibraryReducer from "../redux/sourceLibrarySlice";
import { useActionRunner } from "../hooks/useActionRunner";
import { useActionRegistry } from "../hooks/useActionRegistry";
import { useJob } from "../hooks/useJob";
import type {
    ActionDeclaration,
    EstimateResult,
    JobItemRow,
    JobRow,
} from "../types";
import type { EntityBulkSelection } from "@/lib/entity-list/selection";
import type { VideoRow } from "../types";

function makeStore() {
    return configureStore({
        reducer: { sourceLibrary: sourceLibraryReducer },
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

// ── Fixtures shaped exactly like the contract's rows ─────────────────────────

const PAID_ACTION: ActionDeclaration = {
    key: "transcribe",
    label: "Transcribe",
    description: "Get a timestamped transcript for every selected video.",
    scope: "per_item",
    cost_class: "mixed",
    requires_estimate: true,
    requires_transcripts: false,
    params_schema: null,
    produces: ["transcript"],
};

const ESTIMATE: EstimateResult = {
    estimate_token: "est_01JTESTTOKEN",
    expires_at: new Date(Date.now() + 1_800_000).toISOString(),
    action: "transcribe",
    selected_count: 10,
    already_done: 0,
    free_count: 7,
    paid_count: 3,
    skipped_count: 0,
    paid_video_ids: ["v8", "v9", "v10"],
    cost: {
        currency: "USD",
        free_cost: 0,
        paid_cost_estimate: 2.16,
        paid_cost_low: 1.5,
        paid_cost_high: 3.1,
        basis: "3 videos, 1.1 hours of video",
    },
    time: {
        free_seconds_estimate: 20,
        paid_seconds_estimate: 160,
        wall_seconds_estimate: 175,
        parallelism: 8,
    },
    quota: { units_required: 2, units_remaining: 9000 },
    warnings: [],
    requires_confirmation: true,
};

function selectionOfIds(ids: string[]): EntityBulkSelection<VideoRow> {
    return {
        mode: "ids",
        ids,
        rows: [],
        count: ids.length,
        filter: {
            scope: { kind: "mine" },
            search: "",
            deep: false,
            archived: "active",
            filters: {},
        },
    };
}

function selectionOfEverythingMatching(
    count: number,
): EntityBulkSelection<VideoRow> {
    return {
        mode: "matching",
        ids: Array.from({ length: count }, (_, index) => `v${index}`),
        rows: [],
        count,
        filter: {
            scope: { kind: "mine" },
            search: "",
            deep: false,
            archived: "active",
            filters: { media_kind: { kind: "select", values: ["long"] } },
        },
    };
}

// ═════════════════════════════ A ═════════════════════════════════════════════

describe("A · nothing is spent before a person has seen what it costs", () => {
    let runner: ReturnType<typeof useActionRunner> | null = null;

    function Harness({ actions }: { actions: ActionDeclaration[] }) {
        runner = useActionRunner("lib-1", actions);
        return <>{runner.dialog}</>;
    }

    it("no job is created before a person has seen the cost", async () => {
        estimateAction.mockResolvedValue(ESTIMATE);
        mount(<Harness actions={[PAID_ACTION]} />);
        await flush();

        act(() => {
            void runner!.bulkActions[0].run(selectionOfIds(["v1", "v2"]));
        });
        await flush();

        expect(estimateAction).toHaveBeenCalledTimes(1);
        // THE LAW. Not "createJob was called late" — it was not called at all.
        expect(createJob).not.toHaveBeenCalled();
    });

    it("the person is shown the server's own numbers, not our arithmetic", async () => {
        estimateAction.mockResolvedValue(ESTIMATE);
        mount(<Harness actions={[PAID_ACTION]} />);
        await flush();
        act(() => {
            void runner!.bulkActions[0].run(selectionOfIds(["v1", "v2"]));
        });
        await flush();

        const text = document.body.textContent ?? "";
        expect(text).toContain("7"); // free_count
        expect(text).toContain("3"); // paid_count
        expect(text).toContain("$2.16"); // paid_cost_estimate
        expect(text).toContain(ESTIMATE.cost.basis);
    });

    it("the confirmed job carries the estimate's token", async () => {
        estimateAction.mockResolvedValue(ESTIMATE);
        createJob.mockResolvedValue({ id: "job-1" } as JobRow);
        mount(<Harness actions={[PAID_ACTION]} />);
        await flush();
        act(() => {
            void runner!.bulkActions[0].run(selectionOfIds(["v1", "v2"]));
        });
        await flush();

        const start = Array.from(document.querySelectorAll("button")).find((button) =>
            (button.textContent ?? "").toLowerCase().includes("spend up to"),
        );
        expect(start).toBeTruthy();
        await act(async () => {
            start!.click();
            await Promise.resolve();
        });
        await flush();

        expect(createJob).toHaveBeenCalledTimes(1);
        const body = createJob.mock.calls[0][2] as { estimate_token: string | null };
        expect(body.estimate_token).toBe("est_01JTESTTOKEN");
    });

    it("an estimate that fails leaves the start button unusable and spends nothing", async () => {
        estimateAction.mockRejectedValue(
            new FakeMediaApiError("The daily YouTube quota is exhausted.", 429),
        );
        mount(<Harness actions={[PAID_ACTION]} />);
        await flush();
        act(() => {
            void runner!.bulkActions[0].run(selectionOfIds(["v1"]));
        });
        await flush();

        const buttons = Array.from(document.querySelectorAll("button"));
        const start = buttons.find((button) =>
            (button.textContent ?? "").toLowerCase().includes("start"),
        );
        expect(start?.hasAttribute("disabled")).toBe(true);
        expect(createJob).not.toHaveBeenCalled();
    });

    it('"everything matching" travels as a FILTER, never as a thousand ids', async () => {
        estimateAction.mockResolvedValue(ESTIMATE);
        mount(<Harness actions={[PAID_ACTION]} />);
        await flush();
        act(() => {
            void runner!.bulkActions[0].run(selectionOfEverythingMatching(412));
        });
        await flush();

        const request = estimateAction.mock.calls[0][2] as {
            selection: { video_ids: string[] | null; filter: Record<string, unknown> | null };
        };
        expect(request.selection.video_ids).toBeNull();
        expect(request.selection.filter).toMatchObject({ media_kind: ["long"] });
    });
});

// ═════════════════════════════ B ═════════════════════════════════════════════

describe("B · a job is correct on mount, not only while you are watching", () => {
    const JOB: JobRow = {
        id: "job-7",
        library_id: "lib-1",
        organization_id: "org-1",
        action: "transcribe",
        name: "Transcribe 10 videos",
        status: "running",
        parallelism: 8,
        allow_paid: true,
        totals: { total: 10, queued: 6, running: 1, succeeded: 2, failed: 1, skipped: 0 },
        lane_totals: { free_captions: 7, paid_agent: 3 },
        estimate: ESTIMATE,
        estimate_confirmed_at: new Date().toISOString(),
        progress_percent: 30,
        error: null,
        started_at: new Date(Date.now() - 60_000).toISOString(),
        completed_at: null,
        created_at: new Date(Date.now() - 61_000).toISOString(),
        operation_id: "op-1",
    };

    const ITEMS: JobItemRow[] = [
        {
            id: "i1",
            job_id: "job-7",
            video_id: "v1",
            external_id: "abc",
            title: "First video",
            lane: "free_captions",
            status: "succeeded",
            attempt: 1,
            error: null,
            retryable: false,
            result: { segment_count: 300 },
            started_at: null,
            completed_at: null,
        },
        {
            id: "i2",
            job_id: "job-7",
            video_id: "v2",
            external_id: "def",
            title: "Second video",
            lane: "paid_agent",
            status: "failed",
            attempt: 2,
            error: "YouTube returned no caption track for this video in any language.",
            retryable: true,
            result: null,
            started_at: null,
            completed_at: null,
        },
        {
            id: "i3",
            job_id: "job-7",
            video_id: "v3",
            external_id: "ghi",
            title: "Third video",
            lane: "free_captions",
            status: "running",
            attempt: 1,
            error: null,
            retryable: false,
            result: null,
            started_at: null,
            completed_at: null,
        },
    ];

    let job: ReturnType<typeof useJob> | null = null;

    function Harness() {
        job = useJob("job-7");
        return null;
    }

    it("a reload mid-job shows the server's rows without a single stream event", async () => {
        const order: string[] = [];
        getJob.mockImplementation(async () => {
            order.push("mount-read");
            return { job: JOB, items: ITEMS, items_total: 10 };
        });
        // A stream that never emits — exactly a job whose events all happened
        // while the tab was closed.
        streamJob.mockImplementation(async () => {
            order.push("stream");
            return new Promise(() => {});
        });

        mount(<Harness />);
        await flush();

        expect(job!.loaded).toBe(true);
        expect(job!.items).toHaveLength(3);
        expect(job!.job?.totals.succeeded).toBe(2);
        expect(job!.job?.totals.failed).toBe(1);
        // The mount read happens FIRST. A panel that subscribes before it reads
        // is correct only if it was lucky.
        expect(order[0]).toBe("mount-read");
    });

    it("the failure sentence survives the round trip verbatim", async () => {
        getJob.mockResolvedValue({ job: JOB, items: ITEMS, items_total: 10 });
        streamJob.mockImplementation(async () => new Promise(() => {}));
        mount(<Harness />);
        await flush();

        const failed = job!.items.find((item) => item.status === "failed");
        expect(failed?.error).toBe(
            "YouTube returned no caption track for this video in any language.",
        );
        expect(failed?.retryable).toBe(true);
    });

    it("a job the server reports as finished is never subscribed to", async () => {
        getJob.mockResolvedValue({
            job: { ...JOB, status: "completed", completed_at: new Date().toISOString() },
            items: ITEMS,
            items_total: 10,
        });
        mount(<Harness />);
        await flush();

        expect(job!.loaded).toBe(true);
        expect(job!.isLive).toBe(false);
        expect(streamJob).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════ C ═════════════════════════════════════════════

describe("C · every Action on screen is one the SERVER declared", () => {
    const INVENTED: ActionDeclaration = {
        // A key no line of this codebase has ever heard of. If it renders, the
        // registry is genuinely driving the bar.
        key: "frobnicate_widgets",
        label: "Frobnicate widgets",
        description: "Something the server invented after this screen shipped.",
        scope: "whole_selection",
        cost_class: "free",
        requires_estimate: false,
        requires_transcripts: false,
        params_schema: null,
        produces: ["file"],
    };

    let registry: ReturnType<typeof useActionRegistry> | null = null;
    let runner: ReturnType<typeof useActionRunner> | null = null;

    function Harness() {
        registry = useActionRegistry();
        runner = useActionRunner("lib-1", registry.actions);
        return null;
    }

    it("an Action this code has never heard of still renders", async () => {
        listActions.mockResolvedValue([INVENTED]);
        mount(<Harness />);
        await flush();

        expect(runner!.bulkActions.map((action) => action.id)).toEqual([
            "frobnicate_widgets",
        ]);
        expect(runner!.bulkActions[0].label).toBe("Frobnicate widgets");
    });

    it("a registry that answers nothing produces no buttons", async () => {
        listActions.mockResolvedValue([]);
        mount(<Harness />);
        await flush();

        expect(runner!.bulkActions).toHaveLength(0);
        expect(registry!.error).toBeNull();
    });

    it("a registry that cannot be read says so and invents nothing", async () => {
        listActions.mockRejectedValue(new Error("connection refused"));
        mount(<Harness />);
        await flush();

        expect(runner!.bulkActions).toHaveLength(0);
        expect(registry!.error).toBeTruthy();
        expect(registry!.actions).toHaveLength(0);
    });
});
