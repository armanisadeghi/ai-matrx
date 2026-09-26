/**
 * THREE THINGS THE LIVE SERVER DID TO THIS SCREEN ON 2026-09-17, EACH PROVEN
 * FAILING BEFORE IT PASSED.
 *
 * An independent first-person walk of /libraries as `admin@admin.com` hit a
 * wall at every door: new intake refused with an organization error, the one
 * catalogued Library (Veritasium, 533 Sources) crashed the whole route, and the
 * Library whose catalogue had failed (TED, 5,810 Sources) sat in a loading
 * skeleton with no message, no timeout and no retry. All three were the
 * client's, not the server's. These blocks hold each fix down with the SHAPE
 * THE PRODUCTION SERVER ACTUALLY SENDS, not a shape this repo finds convenient.
 *
 * RED PROOFS (run any of these and the named block fails):
 *
 *   D · a Source whose caption list was never probed — in `catalog/columns.tsx`
 *       and `components/SourceDetailPanel.tsx`, drop the `?? []` and read
 *       `row.caption_languages.length` again (and widen the type back to
 *       `string[]` in `types.ts`).
 *       → "a Source YouTube says is captioned renders when the language list
 *         was never probed" fails with the production crash verbatim:
 *         TypeError: Cannot read properties of null (reading 'length').
 *
 *   E · a failed catalogue is readable from the row — in
 *       `components/LibraryMetricsHeader.tsx`, delete the
 *       `library?.sync_status === "failed"` branch of `SyncStrip`.
 *       → "a Library whose last catalogue failed says so on its own page"
 *         fails: the strip falls through to "This Library has never been
 *         brought up to date", which is a different and untrue sentence, and no
 *         retry control exists.
 *
 *   F · a metrics read that failed stops promising numbers — in the same file,
 *       change `buildTiles(metrics, metricsError !== null)` back to
 *       `buildTiles(metrics)` (or, in `components/LibraryPage.tsx`, swallow the
 *       error in `refreshMetrics` again).
 *       → "numbers that cannot be read stop pretending to load" fails: the
 *         tiles stay skeletons forever with no sentence and no retry.
 *
 *   G · the paste box submits on Enter — in `components/CatalogPasteBox.tsx`,
 *       turn the <form> back into a <div> and the submit button back into
 *       `type="button"`.
 *       → "pressing Enter in the paste box starts the catalogue" fails: the
 *         form the browser submits does not exist.
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

const resolveMediaInput = jest.fn();
const createLibrary = jest.fn();

jest.mock("../api", () => ({
    __esModule: true,
    MediaApiError: class extends Error {
        remedy: string | null = null;
        status: number | undefined;
        hasServerSentence = true;
    },
    resolveMediaInput: (...args: unknown[]) => resolveMediaInput(...args),
    createLibrary: (...args: unknown[]) => createLibrary(...args),
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

import sourceLibraryReducer from "../redux/sourceLibrarySlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { CATALOG_COLUMNS } from "../catalog/columns";
import { LibraryMetricsHeader } from "../components/LibraryMetricsHeader";
import { CatalogPasteBox } from "../components/CatalogPasteBox";
import { isRenderableMetrics } from "../redux/sourceLibrarySlice";
import type { SyncState } from "../redux/sourceLibrarySlice";
import type { LibraryRow, VideoRow } from "../types";

// ── the wire, verbatim ───────────────────────────────────────────────────────

/**
 * One row exactly as `GET /media/libraries/{id}/videos` returned it from
 * `https://server.app.matrxserver.com` (build e09d986, 2026-09-17) for the
 * Veritasium Library — `caption_languages` is `null` on EVERY row today,
 * because the free-captions lane that would probe it is not built yet.
 */
function wireVideo(overrides: Partial<VideoRow> = {}): VideoRow {
    return {
        id: "85dcc9e7-2639-4156-ac65-32cab8113936",
        external_id: "O3a99HNskNk",
        url: "https://www.youtube.com/watch?v=O3a99HNskNk",
        title: "The Scariest Chart In Engineering",
        description: "Why is the Smith Chart one of the scariest charts?",
        channel_id: "UCHnyfMqiRRG1u-2MsSQLbXA",
        channel_title: "Veritasium",
        published_at: "2026-09-10T13:00:12Z",
        duration_iso: "PT1M11S",
        duration_seconds: 71,
        thumbnail_url: "https://i.ytimg.com/vi/O3a99HNskNk/maxresdefault.jpg",
        view_count: 1352799,
        like_count: 29362,
        comment_count: 522,
        media_kind: "short",
        media_kind_signal: "shorts_url",
        live_broadcast_content: "none",
        has_captions: true,
        caption_languages: null,
        transcript_status: "none",
        transcript_id: null,
        transcript_lane: null,
        // Predates SOURCE-CONVERGENCE §1 rule 6: the wire carried neither key.
        processed_document_id: null,
        not_yet_a_source: null,
        // §4.3 — this fixture predates the projection, and the wire it was copied
        // from carried neither key. A Source nothing has run on is exactly this:
        // an empty map and no last action.
        action_outcomes: {},
        last_action: null,
        processing_status: "unprocessed",
        position: null,
        first_discovered_at: "2026-09-17T19:12:05.353528Z",
        last_seen_at: "2026-09-17T20:27:42.990077Z",
        ...overrides,
    };
}

/** A Library row in the state the server leaves behind a failed enumeration. */
function failedLibrary(overrides: Partial<LibraryRow> = {}): LibraryRow {
    return {
        id: "3a2ddefc-ba06-4722-9d63-00317ca3f8cd",
        organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        adapter: "youtube",
        kind: "channel",
        external_id: "UCAuUUnT6oDeKwE6v1NGQxug",
        uploads_playlist_id: "UUAuUUnT6oDeKwE6v1NGQxug",
        name: "TED",
        description: null,
        handle: "@ted",
        canonical_url: "https://www.youtube.com/@ted",
        thumbnail_url: null,
        visibility: "internal",
        item_count: 5810,
        sync_status: "failed",
        sync_error:
            "Listing 'TED' stopped after 5,810 videos because of an unexpected " +
            "server error (TimeoutError). The videos already listed are saved; " +
            "running the sync again picks up from the provider cleanly.",
        last_synced_at: null,
        last_sync_duration_ms: null,
        settings: {},
        metrics: null,
        created_at: "2026-09-17T18:00:00Z",
        updated_at: "2026-09-17T20:00:00Z",
        created_by: null,
        ...overrides,
    };
}

const IDLE_SYNC: SyncState = {
    phase: "idle",
    skippedTotal: 0,
    skippedByReason: {},
    removedCount: 0,
    retireRefused: false,
    startedAt: null,
    finishedElapsedMs: null,
    listed: 0,
    expectedTotal: null,
    pagesReceived: 0,
    operationId: null,
    message: null,
    remedy: null,
    retryable: false,
    partialTotal: null,
    quotaUnitsSpent: null,
    problems: [],
};

function makeStore() {
    return configureStore({
        reducer: {
            sourceLibrary: sourceLibraryReducer,
            appContext: appContextReducer,
        },
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
    jest.clearAllMocks();
});

// ── I ────────────────────────────────────────────────────────────────────────

describe("I · the metrics blob stored on a Library row is not a type", () => {
    /**
     * RED PROOF: in `redux/sourceLibrarySlice.ts`, put
     * `if (action.payload.metrics) entry.metrics = action.payload.metrics;`
     * back into `libraryLoaded` (or drop the `?.` from
     * `metrics.length_by_kind?.long` in LibraryMetricsHeader).
     * → these fail with the second production crash verbatim:
     *   TypeError: Cannot read properties of undefined (reading 'long').
     *
     * `media.source_library.metrics` is a jsonb column written by whatever
     * build last finished a sync. On the TED Library it held a blob without
     * `length_by_kind`, and adopting it blind crashed the page again the
     * moment the Library row started arriving at all.
     */
    const partial = {
        stale: false,
        total: 5810,
        length: { total_seconds: 1, mean_seconds: 1, median_seconds: 1, p90_seconds: 1 },
    };

    it("a blob missing the sections this screen reads is not adopted as metrics", () => {
        expect(isRenderableMetrics(partial)).toBe(false);
        expect(isRenderableMetrics(null)).toBe(false);
        expect(isRenderableMetrics({})).toBe(false);
    });

    it("a complete metrics payload still is", () => {
        expect(
            isRenderableMetrics({
                total: 533,
                counts_by_kind: { long: 448, short: 85, live: 0, unknown: 0 },
                length: {},
                length_by_kind: {},
                date_range: {},
                caption_coverage: {},
                transcripts: {},
                cadence_per_month: [],
            }),
        ).toBe(true);
    });

    it("and the header survives one reaching it anyway", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary()}
                metrics={partial as never}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).toContain("Catalogued in this Library");
        expect(node.textContent).not.toContain("Something went wrong");
        // and it never signs a timestamp it does not have
        expect(node.textContent).not.toContain("Invalid Date");
    });
});

// ── D ────────────────────────────────────────────────────────────────────────

describe("D · a Source the server describes with nulls still renders", () => {
    const captionsColumn = CATALOG_COLUMNS.find((c) => c.id === "has_captions")!;

    it("a Source YouTube says is captioned renders when the language list was never probed", () => {
        const row = wireVideo({ has_captions: true, caption_languages: null });

        // The crash was HERE, before React ever saw an element: building the
        // cell read `.length` off null. Calling it is the whole proof.
        const cell = captionsColumn.column.cell!(row, 0);
        const node = mount(<>{cell}</>);

        expect(node.textContent).toContain("Yes");
        expect(node.textContent).not.toContain("null");
    });

    it("names the languages once something has probed them", () => {
        const row = wireVideo({ has_captions: true, caption_languages: ["en", "es"] });
        const node = mount(<>{captionsColumn.column.cell!(row, 0)}</>);
        expect(node.textContent).toContain("en, es");
    });

    it("an empty probed list is not the same claim as an unprobed one", () => {
        const probed = wireVideo({ has_captions: true, caption_languages: [] });
        const node = mount(<>{captionsColumn.column.cell!(probed, 0)}</>);
        // Neither shape may crash, and neither may invent a language.
        expect(node.textContent).toContain("Yes");
    });

    it("every column renders against the row shape the server actually sends", () => {
        const row = wireVideo();
        for (const spec of CATALOG_COLUMNS) {
            expect(() => spec.column.cell?.(row, 0)).not.toThrow();
        }
    });
});

// ── E ────────────────────────────────────────────────────────────────────────

describe("E · a catalogue that failed is readable from the row, not only from a stream", () => {
    it("a Library whose last catalogue failed says so on its own page", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary()}
                metrics={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );

        expect(node.textContent).toContain("stopped after 5,810 videos");
        expect(node.textContent).not.toContain("never been brought up to date");
        const retry = [...node.querySelectorAll("button")].find((b) =>
            (b.textContent ?? "").includes("Try again"),
        );
        expect(retry).toBeTruthy();
    });

    it("the retry control actually asks for the catalogue again", () => {
        const onBringUpToDate = jest.fn();
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary()}
                metrics={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={onBringUpToDate}
            />,
        );
        const retry = [...node.querySelectorAll("button")].find((b) =>
            (b.textContent ?? "").includes("Try again"),
        )!;
        act(() => {
            retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onBringUpToDate).toHaveBeenCalledTimes(1);
    });

    it("a failure with no server sentence still says something a person can act on", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary({ sync_error: null })}
                metrics={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).toContain("failed");
        expect(node.textContent).not.toContain("never been brought up to date");
    });

    it("a healthy Library is untouched by any of this", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary({
                    name: "Veritasium",
                    sync_status: "idle",
                    sync_error: null,
                    last_synced_at: "2026-09-17T20:28:11.097733Z",
                    last_sync_duration_ms: 31988,
                })}
                metrics={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).toContain("Last brought up to date");
    });
});

// ── F ────────────────────────────────────────────────────────────────────────

describe("F · numbers that cannot be read stop pretending to load", () => {
    const SENTENCE = "The numbers for this Library could not be read from the server.";

    it("a metrics read that failed replaces the skeletons with a sentence and a retry", () => {
        const onRetryMetrics = jest.fn();
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary()}
                metrics={null}
                metricsError={SENTENCE}
                onRetryMetrics={onRetryMetrics}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );

        expect(node.textContent).toContain(SENTENCE);
        const retry = [...node.querySelectorAll("button")].find((b) =>
            (b.textContent ?? "").includes("Try the numbers again"),
        );
        expect(retry).toBeTruthy();
        act(() => {
            retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onRetryMetrics).toHaveBeenCalledTimes(1);
    });

    it("no tile is left promising a number that is never coming", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary()}
                metrics={null}
                metricsError={SENTENCE}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        // The ten tiles carry an em dash instead of a pulsing rectangle.
        expect(node.textContent).toContain("—");
        expect(node.textContent).toContain(
            "The numbers behind this chart could not be read",
        );
    });

    it("before the read has failed, a skeleton is still the honest state", () => {
        const node = mount(
            <LibraryMetricsHeader
                library={failedLibrary({ sync_status: "idle", sync_error: null })}
                metrics={null}
                metricsError={null}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
        expect(node.textContent).not.toContain(SENTENCE);
    });
});

// ── G ────────────────────────────────────────────────────────────────────────

describe("G · the one instruction on the screen is true", () => {
    it("pressing Enter in the paste box starts the catalogue", async () => {
        resolveMediaInput.mockImplementation(
            () => new Promise(() => {}), // never settles; the call is the proof
        );
        const node = mount(<CatalogPasteBox autoFocus={false} />);

        const input = node.querySelector("input")!;
        const form = input.closest("form");
        expect(form).toBeTruthy();

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            )!.set!;
            setter.call(input, "https://www.youtube.com/@mkbhd");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });

        await act(async () => {
            form!.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });

        expect(resolveMediaInput).toHaveBeenCalledTimes(1);
        expect(resolveMediaInput.mock.calls[0][1]).toBe(
            "https://www.youtube.com/@mkbhd",
        );
    });

    it("a keyboard Enter on the input starts the catalogue, with no click anywhere", async () => {
        // jsdom does not implement a form's IMPLICIT submission, so this
        // exercises the component's own keydown path — the one that has to
        // work when a synthesised or composed key event never reaches the
        // browser's default action. The live headless proof of the browser's
        // half is in the re-test section of FIRST-PERSON-TEST.md.
        resolveMediaInput.mockImplementation(() => new Promise(() => {}));
        const node = mount(<CatalogPasteBox autoFocus={false} />);
        const input = node.querySelector("input")!;

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            )!.set!;
            setter.call(input, "https://www.youtube.com/@mkbhd");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });

        await act(async () => {
            input.focus();
            input.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });

        expect(resolveMediaInput).toHaveBeenCalledTimes(1);
    });

    it("an empty box does nothing at all on Enter — no request, no error", async () => {
        resolveMediaInput.mockImplementation(() => new Promise(() => {}));
        const node = mount(<CatalogPasteBox autoFocus={false} />);
        const input = node.querySelector("input")!;
        await act(async () => {
            input.focus();
            input.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });
        expect(resolveMediaInput).not.toHaveBeenCalled();
    });

    it("the button is the form's submit button, not a second door", () => {
        const node = mount(<CatalogPasteBox autoFocus={false} />);
        const button = [...node.querySelectorAll("button")].find((b) =>
            (b.textContent ?? "").includes("Catalogue"),
        )!;
        expect(button.getAttribute("type")).toBe("submit");
    });
});
