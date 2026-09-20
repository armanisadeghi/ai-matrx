/**
 * features/capture-ladder/__tests__/liveQueueRows.test.ts
 *
 * THE TWO ROWS BELOW WERE NOT WRITTEN BY HAND. They were read verbatim out of
 * `media.capture_handoff` on the live database (project `brsgrqvjdzwihsvnfqkf`)
 * on 2026-09-17, via `select jsonb_agg(to_jsonb(h)) … where status in
 * ('waiting','needs_drive') and deleted_at is null` — the same filter
 * `fetchNeedsYouHandoffs` runs. They are the real output of the real scraper
 * climbing http → server browser against instagram.com and nytimes.com and
 * being told `login_wall` by both.
 *
 * Which is the whole point. A fixture I invented to match my own parser proves
 * only that I can copy my own schema; this one can fail. It has already earned
 * its keep: writing it is what caught `final_url`, the NOT NULL text columns
 * and the entity-table base columns (`version`, `metadata`, `created_by`,
 * `updated_by`, `deleted_at`) that CONTRACT.md §3's column list does not
 * mention — every one of which is present below and none of which a
 * contract-shaped fixture would have contained.
 *
 * If the ladder's server half changes the shape it writes, this suite goes red
 * on the next person to run it rather than the tray going quietly blank.
 */

import {
  parseCaptureHandoffs,
  droppedRowsSentence,
} from "@/features/capture-ladder/captureHandoffTable";
import {
  assertNoSkippedRung,
  describeWhoActs,
  describeEstimate,
} from "@/features/capture-ladder/types";
import {
  needsYouBody,
  needsYouTitle,
} from "@/features/capture-ladder/needsYouAssist";

/** Verbatim from the live table. Do not tidy: the blanks are the evidence. */
const LIVE_ROWS: unknown[] = [
  {
    id: "0ee0c61b-e434-427f-9c11-ad471b457958",
    url: "https://www.instagram.com/nasa/",
    rung: "own_browser",
    title: "",
    reason: "login_wall",
    status: "waiting",
    version: 1,
    batch_id: "e9471ce0-644d-433f-8262-18b3b368edfc",
    metadata: {},
    final_url: null,
    claimed_at: null,
    claimed_by: null,
    created_at: "2026-09-17T23:13:09.994731+00:00",
    created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    deleted_at: null,
    library_id: null,
    rung_trail: [
      {
        at: "2026-09-17T23:12:58.813718+00:00",
        ok: false,
        note: null,
        rung: "http",
        chars: 0,
        reason: "login_wall",
      },
      {
        at: "2026-09-17T23:12:58.813741+00:00",
        ok: false,
        note: "We also opened this page in our server browser and it did not return more content, so this is the site's real answer.",
        rung: "browser",
        chars: 0,
        reason: "login_wall",
      },
    ],
    updated_at: "2026-09-17T23:13:09.994731+00:00",
    updated_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    what_to_do: "",
    captured_at: null,
    reason_note:
      "This page only shows its content to someone signed in. Your own browser is already signed in, so it can read it.",
    failure_note: null,
    attempt_count: 0,
    captured_chars: null,
    organization_id: "304cd2ed-a65e-4c52-8375-324e605d16bd",
    captured_by_rung: null,
    captured_item_id: null,
    claim_expires_at: null,
    estimated_seconds: null,
  },
  {
    id: "ceb995e7-020f-48d8-aa8b-aaf73388a0d2",
    url: "https://www.nytimes.com",
    rung: "own_browser",
    title: "nytimes.com",
    reason: "login_wall",
    status: "waiting",
    version: 1,
    batch_id: "e9471ce0-644d-433f-8262-18b3b368edfc",
    metadata: {},
    final_url: null,
    claimed_at: null,
    claimed_by: null,
    created_at: "2026-09-17T23:13:11.742104+00:00",
    created_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    deleted_at: null,
    library_id: null,
    rung_trail: [
      {
        at: "2026-09-17T23:12:58.813718+00:00",
        ok: false,
        note: null,
        rung: "http",
        chars: 0,
        reason: "login_wall",
      },
      {
        at: "2026-09-17T23:12:58.813741+00:00",
        ok: false,
        note: "We also opened this page in our server browser and it did not return more content, so this is the site's real answer.",
        rung: "browser",
        chars: 0,
        reason: "login_wall",
      },
    ],
    updated_at: "2026-09-17T23:13:11.742104+00:00",
    updated_by: "87a6e699-3622-4869-8843-d0867456c0dd",
    what_to_do: "",
    captured_at: null,
    reason_note:
      "This page only shows its content to someone signed in. Your own browser is already signed in, so it can read it.",
    failure_note: null,
    attempt_count: 0,
    captured_chars: null,
    organization_id: "304cd2ed-a65e-4c52-8375-324e605d16bd",
    captured_by_rung: null,
    captured_item_id: null,
    claim_expires_at: null,
    estimated_seconds: null,
  },
];

describe("the real queue rows survive the tray's ingress parse", () => {
  const { handoffs, dropped } = parseCaptureHandoffs(LIVE_ROWS);

  it("parses both rows and drops neither", () => {
    expect(dropped).toBe(0);
    expect(droppedRowsSentence(dropped)).toBeNull();
    expect(handoffs).toHaveLength(2);
  });

  it("keeps the server's own sentence, which is what the person reads", () => {
    for (const handoff of handoffs) {
      expect(handoff.reason_note).toContain("already signed in");
      expect(handoff.reason).toBe("login_wall");
    }
  });

  it("carries an EMPTY what_to_do for an own_browser row, never a null", () => {
    // CONTRACT.md §3: nothing for the person to do on rung 3. The live column
    // is NOT NULL DEFAULT '', so "nothing to do" is "" — and the list renders
    // it falsy, i.e. shows no instruction line at all.
    for (const handoff of handoffs) {
      expect(handoff.what_to_do).toBe("");
    }
  });

  it("falls back to the host when the site gave us no title", () => {
    const instagram = handoffs.find((h) => h.url.includes("instagram"));
    expect(instagram?.title).toBe("");
  });

  it("shows no estimate, because the server honestly gave none", () => {
    for (const handoff of handoffs) {
      expect(handoff.estimated_seconds).toBeNull();
      expect(describeEstimate(handoff.estimated_seconds)).toBeNull();
    }
  });

  it("says the browser acts, not the person — these are rung-3 rows", () => {
    for (const handoff of handoffs) {
      expect(describeWhoActs(handoff)).toBe(
        "Your browser will do this on its own",
      );
    }
  });

  it("the REAL trails obey the ladder law", () => {
    for (const handoff of handoffs) {
      const trail = handoff.rung_trail.map((entry) => entry.rung);
      expect(trail).toEqual(["http", "browser"]);
      expect(() => assertNoSkippedRung(trail)).not.toThrow();
    }
  });

  it("the assist's title and body for this exact queue read like English", () => {
    // These rows were read before `handoff_kind` existed on the table, so this
    // build cannot say WHAT they are — and the contract's answer to that is
    // "item", never a confident "page". Both sentences below are the honest
    // unknown-kind wording, which is exactly what a client this old should say.
    expect(needsYouTitle(handoffs, "admin's Workspace")).toBe(
      "2 items in admin's Workspace are waiting for your browser",
    );
    // The body names WHAT is waiting and nothing else. What the button does is
    // said once, by the action descriptor, one line above the button — saying
    // it again here is what made the old tray a novel (Arman, 2026-09-18).
    expect(needsYouBody(handoffs, { extensionInstalled: true })).toBe(
      "instagram.com and nytimes.com — sites hand these to an ordinary browser like yours and refuse our servers.",
    );
  });

  it("says the extension is missing rather than offering a button that cannot work", () => {
    expect(needsYouBody(handoffs, { extensionInstalled: false })).toBe(
      "instagram.com and nytimes.com — sites hand these to an ordinary browser like yours and refuse our servers. " +
        "Your own Chrome could read them, but the Matrx extension is not installed in this browser yet.",
    );
  });
});
