/**
 * FORCING TESTS — THERE IS ONE PRODUCER OF THE SENTENCE, AND IT IS THE SERVER.
 *
 * Round-3 hostile verification (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N3): aidream's
 * `ApprovalDecisionResponse.sentence` is documented as *"Always set, so no
 * caller has to infer 'what happened' from a status enum"* — and
 * `features/approvals/google-door.ts` narrowed the reply to `approval_id`,
 * `status`, `applied_now` and `receipt`, so the frontend never read it. Two
 * producers for one event, and they had already drifted: for an `accepted` row
 * whose receipt this build cannot read, the server said *"do not assume the
 * change was made"* while the client said *"the change was made"* (§ A-N2).
 *
 * So the door READS the sentence and the one adapter RENDERS it, deriving its
 * own only when the server gave none (an older server, or a reply that carries
 * an empty one). The client still decides the BUCKET — a screen must know
 * whether this click performed anything to count it — but it never writes a
 * competing sentence over one the server sent.
 *
 * § A-N4 is the third case here: a recorded fact inside the code that now
 * teaches the opposite of the server's behaviour.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const postGoogleBackend = jest.fn();
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

// eslint-disable-next-line import/first -- after the mock above
import { readApprovalReceipt, readDecisionReply } from "../receipt";

const UNREADABLE = readApprovalReceipt({ nothing: "this build can read" });
const FAILED = readApprovalReceipt({
  state: "failed",
  error: "Google refused the write: insufficient permission.",
});
const APPLIED = readApprovalReceipt({ state: "applied" });

/** The server's own sentence for `accepted` + an unreadable receipt. */
const SERVER_UNREADABLE =
  "This proposal is accepted and this call did nothing. What happened to it " +
  "is not recorded on the row, so do not assume the change was made.";

describe("the server's sentence is the one a person reads", () => {
  it("REJECT over an accepted row: the server's words, not the client's", () => {
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: false,
      receipt: UNREADABLE,
      decision: "reject",
      what: "Q3 retro",
      serverSentence: SERVER_UNREADABLE,
    });
    expect(reading.bucket).toBe("already");
    expect(reading.message).toContain(SERVER_UNREADABLE);
    // The client's own derivation must not be printed alongside it.
    expect(reading.message).not.toContain("Open the row and check before");
  });

  it("ACCEPT over the same row says the same thing, for the same reason", () => {
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: false,
      receipt: UNREADABLE,
      decision: "accept",
      what: "Q3 retro",
      serverSentence: SERVER_UNREADABLE,
    });
    expect(reading.message).toContain(SERVER_UNREADABLE);
  });

  it("a FAILED apply prints the server's refusal, not a second wording of it", () => {
    const server =
      "The change was NOT made: Google refused the write: insufficient " +
      "permission. Nothing has been retried. Try again, or reject it.";
    const reading = readDecisionReply({
      status: "pending",
      appliedNow: false,
      receipt: FAILED,
      decision: "accept",
      what: "Q3 retro",
      serverSentence: server,
    });
    expect(reading.bucket).toBe("failed");
    expect(reading.message).toContain(server);
  });

  it("derives its own ONLY when the server gave none", () => {
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: false,
      receipt: UNREADABLE,
      decision: "reject",
      what: "Q3 retro",
    });
    expect(reading.message).toContain("the record does not say");
    const empty = readDecisionReply({
      status: "accepted",
      appliedNow: false,
      receipt: UNREADABLE,
      decision: "reject",
      serverSentence: "   ",
    });
    expect(empty.message).toContain("the record does not say");
  });

  it("a performed click still has no sentence — the queue counts it", () => {
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: true,
      receipt: APPLIED,
      decision: "accept",
      serverSentence: "Approved — the change was made in Google.",
    });
    expect(reading.bucket).toBe("performed");
    expect(reading.message).toBeNull();
  });

  it("the bucket is still the client's, and the receipt still outranks the status", () => {
    // A server sentence can never turn a failed receipt into a success: the
    // bucket is what the queue counts on, and it is derived here.
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: true,
      receipt: FAILED,
      decision: "accept",
      serverSentence: "Approved — the change was made in Google.",
    });
    expect(reading.bucket).toBe("failed");
  });
});

describe("the door carries the field off the wire (§ A-N3)", () => {
  it("narrows `sentence` onto the reply, and takes an absent one as none", async () => {
    postGoogleBackend.mockResolvedValue({
      json: async () => ({
        approval_id: "a1",
        status: "accepted",
        applied_now: false,
        receipt: { state: "applied" },
        sentence: "This was already approved and the change was made.",
      }),
    });
    const { applyGoogleApproval } = await import("../google-door");
    await expect(applyGoogleApproval("a1")).resolves.toMatchObject({
      sentence: "This was already approved and the change was made.",
    });

    postGoogleBackend.mockResolvedValue({
      json: async () => ({
        approval_id: "a1",
        status: "dismissed",
        applied_now: true,
        receipt: {},
      }),
    });
    await expect(applyGoogleApproval("a1")).resolves.toMatchObject({
      sentence: null,
    });
  });
});

describe("a recorded fact inside the code is true (§ A-N4)", () => {
  const source = readFileSync(
    join(__dirname, "..", "kinds", "google-proposal.tsx"),
    "utf8",
  );
  it("no longer teaches that a fresh reject answers applied_now: false", () => {
    // B-8 changed it, by name, in the producer's docstring: a fresh reject
    // answers `applied_now: true`, because that call DID change the row.
    expect(source).not.toContain("`applied_now: false` for a FRESH reject");
    expect(source).not.toContain("returns `applied_now: false` for a fresh reject");
  });
});
