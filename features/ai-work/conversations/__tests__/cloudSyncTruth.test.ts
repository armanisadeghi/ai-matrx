/**
 * FORCING TESTS for the CLOUD HALF of the sync truth (CS-25 contract §1/§2/§4).
 *
 * This suite exists because of the dead fish: a conversation whose cloud row
 * exists and whose delivered-entry ledger is EMPTY rendered exactly like one
 * that was fully in sync. The class of bug is a layer nobody read being
 * rendered as agreement — so every test here is about a claim that must NOT
 * reach the screen.
 *
 * Every expected string below is TYPED BY HAND from the contract. Nothing is
 * produced by importing the code under test and asking it what it says.
 *
 * WHAT TURNS EACH TEST RED is named on the test itself.
 */

import {
  SYNC_VERDICT_CODES,
  UNKNOWN_VERDICT_REMEDY,
  cloudVerdictOf,
  readCloudSyncTruth,
  readDiagnosis,
  unknownVerdictSentence,
  type CloudDiagnosis,
} from "../cloudSyncTruth";

jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn() }));

const mockedApiPost = (
  jest.requireMock("@/lib/api/typed-client") as { apiPost: jest.Mock }
).apiPost;

/** A diagnosis with every field present; each test overrides only what it means. */
function diagnosis(overrides: Partial<CloudDiagnosis> = {}): CloudDiagnosis {
  return {
    provider_session_id: "11111111-2222-3333-4444-555555555555",
    session_present: true,
    conversation_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    fidelity: "native",
    status: "active",
    last_seen_at: "2026-09-17T10:00:00Z",
    entries: 55,
    projected_entries: 55,
    skipped_entries: 0,
    pending_entries: 0,
    error_entries: 0,
    projection_errors: [],
    last_entry_at: "2026-09-17T10:00:00Z",
    last_entry_id: "entry-9",
    messages: 2,
    last_position: 2,
    last_message_at: "2026-09-17T10:00:00Z",
    cloud_verdict: "partial_by_design",
    cloud_sentence: "…",
    cloud_remedy: null,
    ...overrides,
  };
}

function respondWith(body: unknown): void {
  mockedApiPost.mockResolvedValue({ data: body, meta: {} });
}

beforeEach(() => {
  mockedApiPost.mockReset();
});

describe("the closed verdict set (contract §1)", () => {
  // RED WHEN: a tenth verdict code is added to, or one is removed from,
  // `SYNC_VERDICT_CODES` without the contract changing. The set is closed.
  it("is exactly the nine codes, in the contract's order", () => {
    expect([...SYNC_VERDICT_CODES]).toEqual([
      "in_sync",
      "partial_by_design",
      "behind_local",
      "behind_cloud",
      "mirror_stale",
      "diverged",
      "quarantined",
      "not_in_cloud",
      "unknown",
    ]);
  });
});

describe("the unknown sentence (contract §2, `unknown` row)", () => {
  // RED WHEN: the `unknown` sentence template is reworded, re-punctuated, or
  // has its two substitutions reordered. Three surfaces render this sentence.
  it("is the contract sentence, with both substitutions in place", () => {
    expect(
      unknownVerdictSentence("this Mac's transcript", "not visible from the server"),
    ).toBe(
      "Cannot tell whether this conversation is in sync: this Mac's transcript could not be read (not visible from the server).",
    );
  });

  // RED WHEN: the `unknown` remedy is reworded.
  it("carries the contract remedy", () => {
    expect(UNKNOWN_VERDICT_REMEDY).toBe(
      "Try again in a moment; if it keeps failing, check that AI Matrx is reachable and you are signed in.",
    );
  });
});

describe("`in_sync` can never come from the cloud half (contract §4)", () => {
  // RED WHEN: the `in_sync` downgrade in `cloudVerdictOf` is removed, or the
  // panel is changed to trust `cloud_verdict` directly. This IS the dead fish:
  // the server never read the transcript, the delivery queue, or the mirror,
  // so an `in_sync` from it is agreement about layers nobody looked at.
  it("downgrades a server `in_sync` to `unknown`, naming the layer it never read", () => {
    const verdict = cloudVerdictOf(
      diagnosis({
        cloud_verdict: "in_sync",
        cloud_sentence:
          "In sync. All 3526 entries are in AI Matrx as 3526 messages; this Mac's copy was last pulled just now.",
        cloud_remedy: null,
      }),
    );
    expect(verdict.code).toBe("unknown");
    expect(verdict.sentence).toBe(
      "Cannot tell whether this conversation is in sync: this Mac's transcript could not be read (not visible from the server).",
    );
    expect(verdict.sentence).not.toContain("In sync");
    expect(verdict.remedy).toBe(
      "Try again in a moment; if it keeps failing, check that AI Matrx is reachable and you are signed in.",
    );
  });

  // RED WHEN: `cloudVerdictOf` stops validating the code against the closed
  // set — a verdict this app does not know would otherwise render whatever
  // English arrived with it.
  it("refuses a verdict code outside the closed set", () => {
    const verdict = cloudVerdictOf(
      diagnosis({
        cloud_verdict: "looks_fine",
        cloud_sentence: "Everything looks fine.",
      }),
    );
    expect(verdict.code).toBe("unknown");
    expect(verdict.sentence).toBe(
      'Cannot tell whether this conversation is in sync: AI Matrx\'s record of this session could not be read (the server sent a verdict this app does not know: "looks_fine").',
    );
    expect(verdict.sentence).not.toContain("Everything looks fine");
  });

  // RED WHEN: a known code with an empty sentence is allowed through, which
  // would put an empty verdict line on the screen — a blank where a sentence
  // belongs is the same silence the old screen had.
  it("refuses a known code that arrived with no sentence", () => {
    const verdict = cloudVerdictOf(
      diagnosis({ cloud_verdict: "behind_local", cloud_sentence: "   " }),
    );
    expect(verdict.code).toBe("unknown");
    expect(verdict.sentence).toBe(
      'Cannot tell whether this conversation is in sync: AI Matrx\'s record of this session could not be read (the server sent the verdict "behind_local" with no sentence).',
    );
  });
});

describe("the server's sentence is rendered verbatim", () => {
  // RED WHEN: any wording is composed locally for a code the server answered.
  // The contract's whole point is ONE wording source, and the measured cause of
  // Arman's mismatch (741 sessions) is this exact sentence.
  it("passes `no_delivery_ledger_in_cloud` through untouched", () => {
    const sentence =
      "AI Matrx has a conversation for this session but no record of a single delivered entry, so none of the 3526 entries in your local transcript are in it. The 2 messages you see there came from the run itself, not from this transcript.";
    const verdict = cloudVerdictOf(
      diagnosis({
        cloud_verdict: "behind_local",
        cloud_sentence: sentence,
        cloud_remedy: "Reconcile to deliver the transcript.",
        entries: 0,
        messages: 2,
      }),
    );
    expect(verdict).toEqual({
      code: "behind_local",
      sentence,
      remedy: "Reconcile to deliver the transcript.",
    });
  });
});

describe("an unreadable answer is never a count", () => {
  // RED WHEN: `readDiagnosis` starts defaulting a missing `entries` to 0. A
  // zero in the Delivered column is a CLAIM that nothing was delivered; a
  // missing field is a gap in the answer. Conflating them is the bug class.
  it("rejects a diagnosis whose counts are missing rather than reading them as 0", () => {
    expect(
      readDiagnosis({
        provider_session_id: "s-1",
        cloud_verdict: "partial_by_design",
        cloud_sentence: "…",
        messages: 2,
      }),
    ).toBeNull();
    expect(readDiagnosis({ provider_session_id: "s-1", entries: 4 })).toBeNull();
    expect(readDiagnosis(null)).toBeNull();
    expect(readDiagnosis("nope")).toBeNull();
  });

  // RED WHEN: `readCloudSyncTruth` is allowed to throw, or returns a diagnosis
  // when the request failed. A throw at this seam leaves the panel empty with
  // no sentence at all.
  it("turns a failed request into `unknown` with no diagnosis", async () => {
    mockedApiPost.mockRejectedValue(new Error("Failed to fetch"));
    const truth = await readCloudSyncTruth("s-1");
    expect(truth.diagnosis).toBeNull();
    expect(truth.verdict.code).toBe("unknown");
    expect(truth.verdict.sentence).toBe(
      "Cannot tell whether this conversation is in sync: AI Matrx's record of this session could not be read (Failed to fetch).",
    );
  });

  // RED WHEN: the refusal branch is dropped. A server build without the
  // `diagnose` action answers with `unknown_action`, and that must read as "we
  // could not find out", never as "nothing is there".
  it("reads a bridge refusal as `unknown`, in the server's words", async () => {
    respondWith({
      action: "diagnose",
      provider: "claude_code",
      refusal: {
        code: "unknown_action",
        message: "This server does not implement the diagnose action.",
      },
    });
    const truth = await readCloudSyncTruth("s-1");
    expect(truth.diagnosis).toBeNull();
    expect(truth.verdict.sentence).toBe(
      "Cannot tell whether this conversation is in sync: AI Matrx's record of this session could not be read (This server does not implement the diagnose action.).",
    );
  });

  // RED WHEN: a 200 with no `diagnosis` block is treated as an empty cloud.
  it("reads a success with no diagnosis block as `unknown`", async () => {
    respondWith({ action: "diagnose", provider: "claude_code" });
    const truth = await readCloudSyncTruth("s-1");
    expect(truth.diagnosis).toBeNull();
    expect(truth.verdict.sentence).toBe(
      "Cannot tell whether this conversation is in sync: AI Matrx's record of this session could not be read (AI Matrx answered without a diagnosis).",
    );
  });
});

describe("the one door", () => {
  // RED WHEN: the cloud half is repointed at a direct Supabase read, or the
  // action/provider/session fields of the bridge request drift. The wording has
  // to come from the server or web and desktop can disagree in English.
  it("asks the aidream bridge with the contract's `diagnose` request", async () => {
    respondWith({
      diagnosis: diagnosis({
        cloud_verdict: "not_in_cloud",
        cloud_sentence:
          "This conversation is not in AI Matrx at all — no session, no messages. Its 3526 local entries have never been delivered.",
        cloud_remedy: "Reconcile to send it.",
      }),
    });
    await readCloudSyncTruth("abc-123", "claude_code");
    expect(mockedApiPost).toHaveBeenCalledWith("/coding-sessions/bridge", {
      schema_version: 1,
      action: "diagnose",
      provider: "claude_code",
      provider_session_id: "abc-123",
    });
  });
});
