/**
 * §4.3 — EVERY ACTION LEAVES A MARK ON THE SOURCE, and this screen can read it.
 *
 * THE DEFECT. A Source could say only whether it had a transcript. Six other
 * Actions ran over the same Sources and wrote nothing back, so a person who sent
 * fifty Sources to a Rulebook, saw "41 succeeded, 6 skipped, 3 failed" on a job
 * panel and closed it could never again learn which forty-one went, which six had
 * no words, or which three broke. This list looked exactly as it had before they
 * clicked.
 *
 * WHAT THESE GUARD, on the client half:
 *
 *   1. THE NEW FIELDS ARE NULLABLE ON THE WIRE. A server that predates the
 *      projection sends neither `action_outcomes` nor `last_action`, and a client
 *      and a server deploy minutes apart. A Source must still list.
 *      RED PROOF: make `parseActionOutcomes` return `obj(payload, field)` instead
 *      of `{}` for a missing value → every Source on every older server is
 *      refused and `/libraries/{id}` goes blank.
 *
 *   2. A MALFORMED OUTCOME COSTS THE NOTE, NEVER THE SOURCE. The per-entry rule
 *      `mapListRows` keeps for a page of rows, one level down.
 *      RED PROOF: throw from `parseActionOutcome` instead of returning null →
 *      "one unreadable outcome never takes the Source with it" fails.
 *
 *   3. A BADGE NEVER RENDERS WITHOUT ITS SENTENCE. An outcome with a status and
 *      no explanation is the silent failure the projection exists to remove.
 *      RED PROOF: drop the `if (!sentence …) return null` line → the outcome with
 *      no sentence parses and the column renders a bare "Failed".
 *
 *   4. THE FILTERS REACH THE SERVER. A filter that only narrows the visible page
 *      lies about its total.
 *      RED PROOF: remove the `action_key` / `action_status` lines from
 *      `toVideoQuery` → the query is empty and every Source comes back.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseVideoListResponse, parseVideoRow, parseMetricsResponse } from "../contract";
import { videoQueryParams } from "../api";
import { toVideoQuery } from "../catalog/service";
import { lastActionColumn } from "../catalog/columns";
import type { VideoRow } from "../types";

const SENT = {
    action_key: "send_to_rulebook",
    job_id: "9f1d0a2e-0000-4000-8000-000000000001",
    status: "ready",
    sentence: "Kept on the Rulebook as a Source, with 476 timed turns.",
    at: "2026-09-19T10:00:00Z",
};

const TRANSCRIBED = {
    action_key: "transcribe",
    job_id: "9f1d0a2e-0000-4000-8000-000000000002",
    status: "ready",
    sentence: "Transcribed from the publisher's own captions — 903 timed segments.",
    at: "2026-09-18T10:00:00Z",
};

/** One row as the server sends it, with whatever §4.3 keys the case needs. */
function wire(extra: Record<string, unknown> = {}) {
    return {
        id: "85dcc9e7-2639-4156-ac65-32cab8113936",
        external_id: "O3a99HNskNk",
        url: "https://www.youtube.com/watch?v=O3a99HNskNk",
        title: "The Scariest Chart In Engineering",
        media_kind: "short",
        transcript_status: "none",
        ...extra,
    };
}

// ── 1. absent is empty, never a refusal ──────────────────────────────────────

test("a server that sends neither field still lists its Sources", () => {
    const row = parseVideoRow(wire(), "videos[0]");
    expect(row.action_outcomes).toEqual({});
    expect(row.last_action).toBeNull();
});

test("an explicit null for either field is read the same way", () => {
    const row = parseVideoRow(
        wire({ action_outcomes: null, last_action: null }),
        "videos[0]",
    );
    expect(row.action_outcomes).toEqual({});
    expect(row.last_action).toBeNull();
});

// ── 2. what the server does send ─────────────────────────────────────────────

test("the outcomes and the line the row shows arrive intact", () => {
    const row = parseVideoRow(
        wire({
            action_outcomes: { send_to_rulebook: SENT, transcribe: TRANSCRIBED },
            last_action: SENT,
        }),
        "videos[0]",
    );
    expect(Object.keys(row.action_outcomes).sort()).toEqual([
        "send_to_rulebook",
        "transcribe",
    ]);
    expect(row.last_action?.action_key).toBe("send_to_rulebook");
    expect(row.last_action?.sentence).toBe(SENT.sentence);
    expect(row.last_action?.job_id).toBe(SENT.job_id);
});

test("a server that sends the map but not the line derives it, newest first", () => {
    const row = parseVideoRow(
        wire({ action_outcomes: { send_to_rulebook: SENT, transcribe: TRANSCRIBED } }),
        "videos[0]",
    );
    expect(row.last_action?.action_key).toBe("send_to_rulebook");
});

// ── 3. per entry, never all-or-nothing ───────────────────────────────────────

test("one unreadable outcome never takes the Source with it", () => {
    const row = parseVideoRow(
        wire({
            action_outcomes: {
                send_to_rulebook: SENT,
                build_knowledge_base: "not an object at all",
            },
        }),
        "videos[0]",
    );
    expect(row.id).toBe("85dcc9e7-2639-4156-ac65-32cab8113936");
    expect(Object.keys(row.action_outcomes)).toEqual(["send_to_rulebook"]);
});

test("an outcome with a status and no sentence is dropped, never half-shown", () => {
    const row = parseVideoRow(
        wire({
            action_outcomes: {
                build_knowledge_base: {
                    status: "failed",
                    at: "2026-09-19T10:00:00Z",
                    sentence: "   ",
                },
            },
        }),
        "videos[0]",
    );
    expect(row.action_outcomes).toEqual({});
    expect(row.last_action).toBeNull();
});

test("a whole page still lists when one row's outcomes are nonsense", () => {
    const page = parseVideoListResponse({
        videos: [wire({ action_outcomes: 7 }), wire({ id: "second", action_outcomes: {} })],
        total: 2,
        filtered_total: 2,
        limit: 25,
        offset: 0,
    });
    expect(page.videos).toHaveLength(2);
    expect(page.row_problems).toEqual([]);
});

// ── 4. the header's counts ───────────────────────────────────────────────────

test("metrics without the new blocks read as nothing, not as a refusal", () => {
    const { value } = parseMetricsResponse({ total: 3 });
    expect(value.action_outcomes).toEqual({});
    expect(value.last_action).toEqual({ ready: 0, running: 0, skipped: 0, failed: 0 });
    expect(value.untouched).toBe(0);
});

test("metrics counts arrive per Action and once per Source", () => {
    const { value } = parseMetricsResponse({
        total: 50,
        action_outcomes: {
            send_to_rulebook: { ready: 41, running: 0, skipped: 6, failed: 3 },
        },
        last_action: { ready: 41, running: 0, skipped: 6, failed: 3 },
        untouched: 0,
    });
    expect(value.action_outcomes.send_to_rulebook.failed).toBe(3);
    expect(value.last_action.skipped).toBe(6);
});

// ── 5. the filters reach the server ──────────────────────────────────────────

test("the Action and Result chips become the contract's own query", () => {
    const query = toVideoQuery({
        page: 1,
        search: "",
        filters: {
            action_key: { kind: "select", values: ["send_to_rulebook"] },
            action_status: { kind: "select", values: ["failed", "skipped"] },
        },
    } as never);
    expect(query.action_key).toBe("send_to_rulebook");
    expect(query.action_status).toEqual(["failed", "skipped"]);

    const params = videoQueryParams(query);
    expect(params.action_key).toBe("send_to_rulebook");
    expect(params.action_status).toBe("failed,skipped");
});

test("no chip chosen sends no narrowing at all", () => {
    const params = videoQueryParams(toVideoQuery({ page: 1, filters: {} } as never));
    expect(params.action_key).toBeUndefined();
    expect(params.action_status).toBeUndefined();
});

// ── 6. what the row actually shows ───────────────────────────────────────────

function cellHtml(row: Partial<VideoRow>): string {
    const spec = lastActionColumn({ send_to_rulebook: "Send to a Masterwork Rulebook" });
    const cell = spec.column.cell as (r: VideoRow) => React.ReactNode;
    return renderToStaticMarkup(<>{cell(row as VideoRow)}</>);
}

test("the row shows the runner's own sentence, under the Action's own label", () => {
    const html = cellHtml({
        last_action: { ...SENT, status: "ready" } as VideoRow["last_action"],
    });
    expect(html).toContain("Ready");
    expect(html).toContain("Send to a Masterwork Rulebook");
    expect(html).toContain("Kept on the Rulebook as a Source, with 476 timed turns.");
});

test("a Source nothing has run on shows a dash, never a word meaning nothing", () => {
    const html = cellHtml({ last_action: null });
    expect(html).toContain("\u2014");
    expect(html).not.toContain("Ready");
    expect(html).not.toContain("None");
});

test("an Action this build has not been told about shows its key, never a made-up name", () => {
    const html = cellHtml({
        last_action: {
            action_key: "organize",
            job_id: null,
            status: "failed",
            sentence: "It broke, and here is why.",
            at: "2026-09-19T10:00:00Z",
        },
    });
    expect(html).toContain("organize");
    expect(html).toContain("It broke, and here is why.");
});
