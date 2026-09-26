/**
 * features/capture-ladder/__tests__/residentialTrailEntry.test.ts
 *
 * THE ROW BELOW WAS NOT WRITTEN BY HAND. It was read verbatim out of
 * `media.capture_handoff` on the live database (project `brsgrqvjdzwihsvnfqkf`)
 * on 2026-09-20 — `select to_jsonb(h) … where rung_trail::text like
 * '%residential%'` — and it is one of TEN rows that looked exactly like it.
 *
 * WHAT IT IS EVIDENCE OF. At 08:15:13 on 2026-09-20 the tray dropped all ten,
 * ten times over, with `[capture-ladder] a media.capture_handoff row did not
 * match the contract and was dropped … path: ["rung_trail", 1, "rung"]`. Entry
 * 1 of this trail is `residential` — residential egress, an OPTIONAL trail
 * entry that `matrx_scraper.ladder` has declared legal since it existed and
 * that this repo's `RUNGS` enum did not admit. The rows were `waiting` at the
 * time (this one was captured by the extension seventeen minutes later, which
 * is why its status reads `captured` now): real pages, really waiting on a
 * person's browser, absent from the only web screen that lists them.
 *
 * Every assertion below FAILS against the code as it stood that morning. That
 * is the point of the file — a fixture invented to match the parser proves
 * only that the parser matches itself.
 */

import {
  parseCaptureHandoff,
  parseCaptureHandoffs,
} from "@/features/capture-ladder/captureHandoffTable";
import {
  assertNoSkippedRung,
  lastOrderedRung,
  trailRungLabel,
  OPTIONAL_RUNGS,
  RUNGS,
} from "@/features/capture-ladder/types";
import {
  readLadderOutcome,
  lastRungAttempted,
} from "@/features/capture-ladder/ladderOutcome";

/** Verbatim from the live table. Do not tidy: the notes are the evidence. */
const LIVE_RESIDENTIAL_ROW: unknown = {
  id: "91c80d71-1b4c-48bf-9907-fc92a5ad39cb",
  url: "https://www.youtube.com/watch?v=o8RQsg4OZts",
  rung: "own_browser",
  title: "How an AR-coating works",
  reason: "cloudflare_block",
  status: "waiting",
  version: 3,
  batch_id: "00cc807a-e440-49e2-bdbb-ab96719d4315",
  metadata: { claimed_by_client: "chrome-extension" },
  final_url: "https://www.youtube.com/watch?v=o8RQsg4OZts",
  claimed_at: null,
  claimed_by: null,
  created_at: "2026-09-20T08:00:19.213553+00:00",
  created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
  deleted_at: null,
  library_id: "6a25fdbd-feec-4725-a0b5-c7f58a87e5f1",
  rung_trail: [
    {
      at: "2026-09-20T08:00:18.882122+00:00",
      ok: false,
      note: "YouTube would not answer what captions this video has — it asked the server to prove it is not a robot (LOGIN_REQUIRED).",
      rung: "http",
      chars: 0,
      reason: "cloudflare_block",
    },
    {
      at: "2026-09-20T08:00:19.047829+00:00",
      ok: false,
      note: "You have not set up a computer to browse through yet.",
      rung: "residential",
      chars: 0,
      reason: "cloudflare_block",
    },
    {
      at: "2026-09-20T08:00:19.047866+00:00",
      ok: false,
      note: "This server has no browser running, so the video's page could not be opened in one.",
      rung: "browser",
      chars: 0,
      reason: "cloudflare_block",
    },
  ],
  updated_at: "2026-09-20T08:00:19.213553+00:00",
  updated_by: "87a6e699-3622-4869-8843-d0867456c0dd",
  what_to_do: "",
  captured_at: null,
  reason_note:
    "The site showed a bot check that our server browser could not pass. Your own browser passes it without noticing.",
  failure_note: null,
  handoff_kind: "youtube_captions",
  attempt_count: 1,
  custom_fields: {},
  captured_chars: null,
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  captured_by_rung: null,
  captured_processed_document_id: null,
  claim_expires_at: null,
  estimated_seconds: null,
};

describe("a residential entry is a lawful part of a trail", () => {
  it("declares the optional vocabulary separately from the four rungs", () => {
    // The order is aidream's and is never re-declared here (types.ts header).
    expect(RUNGS).toEqual(["http", "browser", "own_browser", "human_drive"]);
    expect(OPTIONAL_RUNGS).toEqual(["residential"]);
    // An optional entry is NOT a rung. Conflating the two is the other way to
    // get this wrong: it would make `http → residential` look like a step.
    expect(RUNGS).not.toContain("residential");
  });

  it("THE REGRESSION: the live row parses instead of being dropped", () => {
    const parsed = parseCaptureHandoff(LIVE_RESIDENTIAL_ROW);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("91c80d71-1b4c-48bf-9907-fc92a5ad39cb");
    // And the optional entry SURVIVES the parse — kept, not quietly filtered.
    expect(parsed?.rung_trail.map((e) => e.rung)).toEqual([
      "http",
      "residential",
      "browser",
    ]);
  });

  it("does not report a drop for a queue made of these rows", () => {
    const { handoffs, dropped } = parseCaptureHandoffs([
      LIVE_RESIDENTIAL_ROW,
      LIVE_RESIDENTIAL_ROW,
    ]);
    expect(dropped).toBe(0);
    expect(handoffs).toHaveLength(2);
  });

  it("the ladder law steps OVER the optional entry rather than accusing it", () => {
    expect(() =>
      assertNoSkippedRung(["http", "residential", "browser", "own_browser"]),
    ).not.toThrow();
    // A trail of nothing but an optional entry is not a skip either.
    expect(() => assertNoSkippedRung(["residential"])).not.toThrow();
  });

  it("still REFUSES a real skip that happens to contain an optional entry", () => {
    // The optional entry must not become a loophole: `browser → human_drive`
    // is still the jump the contract names, residential or not.
    expect(() =>
      assertNoSkippedRung(["http", "residential", "browser", "human_drive"]),
    ).toThrow();
  });

  it("still REFUSES a key that is neither a rung nor an optional entry", () => {
    expect(() => assertNoSkippedRung(["http", "cloud_browser"])).toThrow();
  });

  it("answers 'where did this get to' with the last RUNG, not the last entry", () => {
    // A trail that ENDS on the optional entry still reached `http`.
    expect(lastOrderedRung([{ rung: "http" }, { rung: "residential" }])).toBe(
      "http",
    );
    expect(lastOrderedRung([{ rung: "residential" }])).toBeNull();
    expect(lastOrderedRung([])).toBeNull();
  });

  it("keeps the optional entry in a rendered scrape outcome", () => {
    const outcome = readLadderOutcome({
      rung_trail: [
        { rung: "http", ok: false, at: "2026-09-20T08:00:18.882122+00:00" },
        {
          rung: "residential",
          ok: false,
          at: "2026-09-20T08:00:19.047829+00:00",
        },
      ],
      next_rung: "browser",
    });
    // "The rung trail is SHOWN, not summarised" — including this entry.
    expect(outcome?.rung_trail?.map((e) => e.rung)).toEqual([
      "http",
      "residential",
    ]);
    expect(lastRungAttempted(outcome)).toBe("http");
  });

  it("gives the optional entry a sentence, never a bare key on a screen", () => {
    expect(trailRungLabel("residential")).not.toBe("residential");
    expect(trailRungLabel("http")).toBe("Read straight off the web");
  });
});
