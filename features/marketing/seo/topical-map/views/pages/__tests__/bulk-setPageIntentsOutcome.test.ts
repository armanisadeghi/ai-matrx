/**
 * `toSetPageIntentsOutcome` over the result migration 23 actually builds.
 *
 * 🚨 WHERE THIS DOCUMENT COMES FROM. The rows below are transcribed from the
 * `jsonb_build_object` that aidream's
 * `0805_a_map_edge_names_the_person_who_wrote_it.sql` returns (lines 66–238 of
 * that file) — `{ ok, map_id, set, kept, failed, results:[…] }` with the three
 * row shapes: SET `{ok:true, page_id, url?}`, KEPT
 * `{ok:true, page_id, url?, kept_existing:{source, state}}` and FAILED
 * `{ok:false, page_id?, url?, error}`. That aidream checkout is NOT present in
 * this container (`../aidream` does not exist here), so the bytes were
 * transcribed from the lane owner's brief quoting those lines rather than read
 * off disk — if the shape has moved since, this file is the thing to re-check.
 *
 * The page ids and urls are the RECORDED ones from
 * `redux/__fixtures__/listPageIntentsRound22.ts`, so the document describes the
 * same world the rest of this lane's tests do.
 *
 * WHAT MUST NOT REGRESS: a KEPT row carries `ok: true`, so any narrowing that
 * keys on `ok` alone silently counts it as written. Watched failing first
 * against exactly that (`row.ok === true ? set : failed`), which put
 * `orphan-one` in `setPageIds` and answered `kept: 0`.
 */

import type { SetPageIntentsResult } from "../../../types";
import {
  isSetPageIntentsKeptRow,
  mergeSetPageIntentsOutcomes,
  setPageIntentsOutcomeLine,
  toSetPageIntentsOutcome,
} from "../bulk/setPageIntentsOutcome";

const MOVER = "61388277-224f-42b8-9414-015f9d3e4af7";
const ARRIVER = "c95d9faf-f1f1-4fa5-9850-9f4a3ee6838d";
const ORPHAN_ONE = "2c03ce6d-e399-41cb-9c75-21f02f080c28";
const ORPHAN_TWO = "16eedfd2-ca75-4de2-ac3c-ea7233fc1c40";

/** The migration-23 document: two set, one kept, one failed. */
const MIGRATION_23_RESULT = {
  ok: false,
  map_id: "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11",
  set: 2,
  kept: 1,
  failed: 1,
  results: [
    { ok: true, page_id: MOVER, url: "https://tmdc-a-7a6b5311.invalid/mover" },
    { ok: true, page_id: ARRIVER, url: "https://tmdc-a-7a6b5311.invalid/arriver" },
    {
      ok: true,
      page_id: ORPHAN_ONE,
      url: "https://tmdc-a-7a6b5311.invalid/orphan-one",
      kept_existing: { source: "human", state: "accepted" },
    },
    {
      ok: false,
      page_id: ORPHAN_TWO,
      url: "https://tmdc-a-7a6b5311.invalid/orphan-two",
      error:
        "set_page_intents: page covers no topic in this map and no topic_slug was given",
    },
  ],
} as unknown as SetPageIntentsResult;

describe("toSetPageIntentsOutcome", () => {
  it("counts set, kept and failed as three separate answers", () => {
    const outcome = toSetPageIntentsOutcome(MIGRATION_23_RESULT);

    expect(outcome.set).toBe(2);
    expect(outcome.kept).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.setPageIds).toEqual([MOVER, ARRIVER]);
    expect(outcome.keptRows).toHaveLength(1);
    expect(outcome.keptRows[0].page_id).toBe(ORPHAN_ONE);
    expect(outcome.failedRows).toHaveLength(1);
  });

  it("never counts a kept row as failed, and never as written", () => {
    const outcome = toSetPageIntentsOutcome(MIGRATION_23_RESULT);

    expect(outcome.setPageIds).not.toContain(ORPHAN_ONE);
    expect(outcome.failedRows.map((row) => row.page_id)).not.toContain(ORPHAN_ONE);
    expect(outcome.keptRows.map((row) => row.page_id)).toEqual([ORPHAN_ONE]);
  });

  it("keeps the failure's SQLERRM byte for byte", () => {
    const outcome = toSetPageIntentsOutcome(MIGRATION_23_RESULT);

    expect(outcome.failedRows[0].error).toBe(
      "set_page_intents: page covers no topic in this map and no topic_slug was given",
    );
  });

  it("derives `kept` from the rows when the result carries no `kept` scalar", () => {
    // The pre-migration-23 document: `kept` simply is not a key. Reading a
    // missing key as 0 would hide a kept row that IS in `results`.
    const withoutScalar = {
      ok: true,
      map_id: "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11",
      set: 1,
      failed: 0,
      results: [
        { ok: true, page_id: MOVER },
        {
          ok: true,
          page_id: ORPHAN_ONE,
          kept_existing: { source: "agent", state: "done" },
        },
      ],
    } as unknown as SetPageIntentsResult;

    const outcome = toSetPageIntentsOutcome(withoutScalar);
    expect(outcome.kept).toBe(1);
    expect(outcome.setPageIds).toEqual([MOVER]);
  });

  it("reports a row it cannot read as a failure rather than dropping it", () => {
    const malformed = {
      ok: true,
      map_id: "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11",
      results: ["not-a-row"],
    } as unknown as SetPageIntentsResult;

    const outcome = toSetPageIntentsOutcome(malformed);
    expect(outcome.failed).toBe(1);
    expect(outcome.failedRows[0].error).toContain("not an object");
  });
});

describe("isSetPageIntentsKeptRow", () => {
  it("does not mistake a null kept_existing for a kept row", () => {
    // `typeof null === "object"`, which is exactly how a kept-row check grows a
    // hole: a row whose `kept_existing` came back null would be read as kept.
    expect(isSetPageIntentsKeptRow({ ok: true, page_id: MOVER, kept_existing: null })).toBe(
      false,
    );
    expect(
      isSetPageIntentsKeptRow({
        ok: true,
        page_id: MOVER,
        kept_existing: { source: "human", state: "accepted" },
      }),
    ).toBe(true);
  });
});

describe("mergeSetPageIntentsOutcomes", () => {
  it("adds the per-site answers up without losing a single row", () => {
    const first = toSetPageIntentsOutcome(MIGRATION_23_RESULT);
    const second = toSetPageIntentsOutcome({
      ok: true,
      map_id: "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11",
      set: 1,
      kept: 0,
      failed: 0,
      results: [{ ok: true, page_id: ORPHAN_TWO }],
    } as unknown as SetPageIntentsResult);

    const merged = mergeSetPageIntentsOutcomes([first, second]);
    expect(merged.set).toBe(3);
    expect(merged.kept).toBe(1);
    expect(merged.failed).toBe(1);
    expect(merged.keptRows).toHaveLength(1);
    expect(merged.failedRows).toHaveLength(1);
    expect(merged.result.results).toHaveLength(5);
  });
});

describe("setPageIntentsOutcomeLine", () => {
  it("names kept in the person's words, never as a number on its own", () => {
    expect(setPageIntentsOutcomeLine(toSetPageIntentsOutcome(MIGRATION_23_RESULT))).toBe(
      "Set 2 · Kept 1 (a person already decided this page) · Failed 1",
    );
  });
});
