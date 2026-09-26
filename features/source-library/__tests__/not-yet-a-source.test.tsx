/**
 * SOURCE-CONVERGENCE §1 rule 6 / §8.6 — a catalogued video is not yet a
 * Source until its words land. The row repeats the server's two facts
 * (`not_yet_a_source`, `processed_document_id`), offers Transcribe ONLY when
 * the server declared it runnable, says "Transcribing…" until the Source id
 * arrives, and opens the Source once it has one.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseVideoRow } from "../contract";
import { SourceStateCell } from "../catalog/SourceStateCell";
import {
    TRANSCRIBE_WATCH_MS,
    anyTranscribing,
    catalogSourceState,
    type SourceStateContext,
} from "../catalog/sourceState";
import { cataloguedSourceIds, listsCataloguedSources } from "../catalog/cataloguedSources";
import type { ActionDeclaration, VideoRow } from "../types";

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const TRANSCRIBE: ActionDeclaration = {
    key: "transcribe",
    label: "Transcribe",
    description: "",
    scope: "per_item",
    cost_class: "mixed",
    requires_estimate: true,
    requires_transcripts: false,
    params_schema: null,
    produces: ["transcript"],
};

const NOT_YET = {
    reason: "no_transcript",
    message: "Not yet a Source — transcribe it to make its words a Source.",
    offered_action: "transcribe",
};

function wire(over: Record<string, unknown> = {}): VideoRow {
    return parseVideoRow(
        {
            id: "v1",
            external_id: "abc",
            url: "https://www.youtube.com/watch?v=abc",
            title: "A video",
            transcript_status: "none",
            not_yet_a_source: NOT_YET,
            ...over,
        },
        "videos[0]",
    );
}

function ctx(over: Partial<SourceStateContext> = {}): SourceStateContext {
    return { pending: {}, now: 1_000_000, actions: [TRANSCRIBE], transcribable: true, ...over };
}

describe("the wire carries both facts", () => {
    it("reads not_yet_a_source and processed_document_id off the row", () => {
        const none = wire();
        expect(none.not_yet_a_source?.offered_action).toBe("transcribe");
        expect(none.not_yet_a_source?.message).toContain("Not yet a Source");
        expect(none.processed_document_id).toBeNull();

        const done = wire({
            not_yet_a_source: null,
            transcript_status: "ready",
            transcript_id: "t1",
            processed_document_id: "doc-1",
        });
        expect(done.not_yet_a_source).toBeNull();
        expect(done.processed_document_id).toBe("doc-1");
    });

    it("a server that predates the facts leaves both null — never a Source by default", () => {
        const old = wire({ not_yet_a_source: undefined });
        expect(old.not_yet_a_source).toBeNull();
        expect(catalogSourceState(old, ctx()).kind).toBe("unknown");
    });
});

describe("catalogSourceState", () => {
    it("no transcript → Not yet a Source with a live Transcribe", () => {
        const state = catalogSourceState(wire(), ctx());
        expect(state.kind).toBe("not_yet");
        if (state.kind === "not_yet") expect(state.transcribe.available).toBe(true);
    });

    it("the server declared transcribe unavailable → no control, the server's reason", () => {
        const state = catalogSourceState(
            wire(),
            ctx({
                actions: [
                    { ...TRANSCRIBE, available: false, unavailable_reason: "Captions cannot be fetched here." },
                ],
            }),
        );
        expect(state).toEqual({
            kind: "not_yet",
            message: NOT_YET.message,
            transcribe: { available: false, reason: "Captions cannot be fetched here." },
        });
    });

    it("registry not answered, action absent, or a kind with nothing to transcribe → no control", () => {
        for (const c of [
            ctx({ actions: undefined }),
            ctx({ actions: [] }),
            ctx({ transcribable: false }),
        ]) {
            const state = catalogSourceState(wire(), c);
            expect(state.kind).toBe("not_yet");
            if (state.kind === "not_yet") expect(state.transcribe.available).toBe(false);
        }
    });

    it("started here → Transcribing… until the Source id appears, then Source", () => {
        const pending = { v1: 1_000_000 };
        expect(catalogSourceState(wire(), ctx({ pending })).kind).toBe("transcribing");
        // transcript written, Source not landed yet — still transcribing.
        expect(
            catalogSourceState(
                wire({ transcript_status: "ready", not_yet_a_source: null }),
                ctx({ pending }),
            ).kind,
        ).toBe("transcribing");
        expect(
            catalogSourceState(
                wire({ transcript_status: "ready", not_yet_a_source: null, processed_document_id: "doc-9" }),
                ctx({ pending }),
            ),
        ).toEqual({ kind: "source", processedDocumentId: "doc-9" });
    });

    it("the server's own queued/running is Transcribing… with or without this screen", () => {
        expect(catalogSourceState(wire({ transcript_status: "running" }), ctx()).kind).toBe(
            "transcribing",
        );
    });

    it("a failed run, or a watch past its window, stops spinning and offers the action again", () => {
        const pending = { v1: 1_000_000 };
        expect(
            catalogSourceState(wire({ transcript_status: "failed" }), ctx({ pending })).kind,
        ).toBe("not_yet");
        expect(
            catalogSourceState(wire(), ctx({ pending, now: 1_000_000 + TRANSCRIBE_WATCH_MS + 1 }))
                .kind,
        ).toBe("not_yet");
    });

    it("the list keeps re-reading only while a row is transcribing", () => {
        expect(anyTranscribing([wire()], ctx())).toBe(false);
        expect(anyTranscribing([wire()], ctx({ pending: { v1: 1_000_000 } }))).toBe(true);
    });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});
function render(node: React.ReactNode) {
    act(() => root.render(node));
}
const buttons = () => Array.from(container.querySelectorAll("button"));

describe("SourceStateCell", () => {
    it("reads 'Not yet a Source' and Transcribe calls the runner with the row", () => {
        const onTranscribe = jest.fn();
        const row = wire();
        render(
            <SourceStateCell row={row} state={catalogSourceState(row, ctx())} onTranscribe={onTranscribe} />,
        );
        expect(container.textContent).toContain("Not yet a Source");
        const transcribe = buttons().find((b) => b.textContent === "Transcribe");
        expect(transcribe).toBeTruthy();
        act(() => transcribe!.click());
        expect(onTranscribe).toHaveBeenCalledWith(row);
    });

    it("renders NO Transcribe button when unavailable — absent, never greyed", () => {
        const row = wire();
        render(
            <SourceStateCell
                row={row}
                state={catalogSourceState(row, ctx({ actions: [] }))}
                onTranscribe={jest.fn()}
            />,
        );
        expect(container.textContent).toContain("Not yet a Source");
        expect(buttons()).toHaveLength(0);
    });

    it("a transcribed video reads Source and Open goes to the Source screen", () => {
        const row = wire({ not_yet_a_source: null, transcript_status: "ready", processed_document_id: "doc-1" });
        render(<SourceStateCell row={row} state={catalogSourceState(row, ctx())} />);
        expect(container.textContent).toContain("Source");
        expect(container.textContent).not.toContain("Not yet");
        const open = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Open");
        expect(open?.getAttribute("href")).toMatch(/doc-1/);
    });
});

describe("web-capture Libraries list their catalogued Sources", () => {
    it("only web_capture lists by edge", () => {
        expect(listsCataloguedSources("web_capture")).toBe(true);
        expect(listsCataloguedSources("youtube")).toBe(false);
        expect(listsCataloguedSources(undefined)).toBe(false);
    });

    it("takes only catalogued_source links, deduped, in order", () => {
        expect(
            cataloguedSourceIds([
                { resourceId: "a", label: "catalogued_source" },
                { resourceId: "b", label: "about" },
                { resourceId: "a", label: "catalogued_source" },
                { resourceId: "c", label: "catalogued_source" },
                { resourceId: "d", label: null },
            ]),
        ).toEqual(["a", "c"]);
    });
});
