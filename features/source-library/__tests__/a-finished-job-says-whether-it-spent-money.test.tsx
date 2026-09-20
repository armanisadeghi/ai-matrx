/**
 * THE GUARD for the 2026-09-20 silent-spend class.
 *
 * WHAT BROKE. A live production run on 2026-09-20 (library
 * 6a25fdbd-feec-4725-a0b5-c7f58a87e5f1) escalated five blocked videos to the
 * paid `paid_agent` lane and spent real money for a caller that never
 * mentioned money: `allow_paid` defaulted to TRUE on the wire and the
 * organisation's `allow_paid_by_default` knob was never read. The server now
 * resolves "nobody said" against that knob and states the outcome in a
 * `paid_policy` object frozen onto the Job row at pricing time.
 *
 * THE CLIENT HALF, which is what this file holds: a FINISHED job must say
 * whether money was spent. A job panel that shows counts and a progress bar
 * but never names the bill is how the spend went unnoticed in the first
 * place — and when paid work was NOT run, the same surface must carry the
 * server's own way to allow it next time, or the person is left with work
 * that silently did not happen.
 *
 * WHY IT CANNOT GO GREEN ON A LIE (`forcing-function-tests`):
 *   • Only `@/lib/api/call-api` — the one module that speaks HTTP — is
 *     stubbed. The real `getJob`, the real `contract.ts` parsers (including
 *     the tolerance for a row that carries no policy at all), the real
 *     `useJob`, the real Redux slice, the real `JobPanel` and the real React
 *     DOM renderer all run.
 *   • It asserts the SERVER'S sentence, character for character, in the
 *     panel's own text — never a client-authored paraphrase, and never a flag.
 *
 * RED PROOF (run it, do not trust this comment): delete the `job.paid_policy`
 * block from `components/JobPanel.tsx` and block A fails on the missing
 * sentence, which is exactly the screen that let the 2026-09-20 spend pass
 * unremarked.
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

interface FakeCall {
    path: string;
    method: string;
    stream?: boolean;
    onStreamEvent?: (event: { event: string; data?: unknown }) => void;
}

const transport = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
    __esModule: true,
    callApi: (config: FakeCall) => () => transport(config),
}));

import sourceLibraryReducer from "../redux/sourceLibrarySlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { JobPanel } from "../components/JobPanel";

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

/** The 2026-09-20 run's own shape: five items that would have been paid. */
const NOT_ALLOWED_SENTENCE =
    "Paid work was NOT run and nothing was charged: 5 videos have no usable captions and were left without a transcript.";
const HOW_TO_ALLOW =
    "To transcribe them anyway, turn on paid transcription for this run, or switch on paid work by default for this organization in Library settings.";
const ALLOWED_SENTENCE =
    "PAID WORK IS SWITCHED ON for this run: 5 videos will be watched by a model and will cost roughly $1.08.";

function finishedJob(paidPolicy: unknown) {
    return {
        id: "job-9",
        library_id: "6a25fdbd-feec-4725-a0b5-c7f58a87e5f1",
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
        action: "transcribe",
        name: "Transcribe 5 videos",
        status: "completed",
        parallelism: 4,
        allow_paid: false,
        totals: { total: 5, queued: 0, running: 0, succeeded: 0, failed: 0, skipped: 5 },
        lane_totals: { free_captions: 0 },
        estimate: null,
        paid_policy: paidPolicy,
        estimate_confirmed_at: null,
        progress_percent: 100,
        error: null,
        started_at: new Date(Date.now() - 120_000).toISOString(),
        completed_at: new Date(Date.now() - 60_000).toISOString(),
        created_at: new Date(Date.now() - 121_000).toISOString(),
        operation_id: "op-9",
    };
}

describe("A · a finished job states whether money was spent", () => {
    it("says nothing was charged, and how to allow it, when paid work was not allowed", async () => {
        transport.mockResolvedValue({
            data: {
                job: finishedJob({
                    allowed: false,
                    decided_by: "organization_default",
                    would_be_paid_count: 5,
                    sentence: NOT_ALLOWED_SENTENCE,
                    how_to_allow: HOW_TO_ALLOW,
                }),
                items: [],
                items_total: 0,
            },
        });

        mount(<JobPanel jobId="job-9" />);
        await flush();

        // The job read back and painted — this is not a refused shape.
        expect(container!.querySelector("h2")).not.toBeNull();
        // The bill, in the server's own words, on the finished job.
        expect(text()).toContain(NOT_ALLOWED_SENTENCE);
        // And the way out of it: work that did not happen never dead-ends.
        expect(text()).toContain(HOW_TO_ALLOW);
    });

    it("says paid work was switched on when it was", async () => {
        transport.mockResolvedValue({
            data: {
                job: finishedJob({
                    allowed: true,
                    decided_by: "request",
                    would_be_paid_count: 5,
                    sentence: ALLOWED_SENTENCE,
                    how_to_allow: null,
                }),
                items: [],
                items_total: 0,
            },
        });

        mount(<JobPanel jobId="job-9" />);
        await flush();

        expect(text()).toContain(ALLOWED_SENTENCE);
    });

    it("a job frozen before this contract is silent about money, never guessed", async () => {
        transport.mockResolvedValue({
            data: { job: finishedJob(undefined), items: [], items_total: 0 },
        });

        mount(<JobPanel jobId="job-9" />);
        await flush();

        // It reads fine — an absent policy never costs the panel.
        expect(container!.querySelector("h2")).not.toBeNull();
        expect(text()).toContain("Transcribe 5 videos");
        // And it invents neither answer.
        expect(text()).not.toContain("nothing was charged");
        expect(text()).not.toContain("PAID WORK IS SWITCHED ON");
    });
});
