/**
 * CENSUS — THE CLIENT'S RECEIPT VOCABULARY IS THE SERVER'S, MEASURED.
 *
 * WHY THIS EXISTS (round-4 hostile verification, 2026-09-17, finding V14-4).
 * `receipt.ts` claimed a forcing function it did not have: *"the next state
 * aidream adds fails `pnpm type-check` here instead of quietly reading as
 * applied or as failed."* That is only true if a human first mirrors the new
 * constant into the TypeScript union — the union was a HAND COPY of aidream's
 * `RECEIPT_*` constants and NOTHING diffed the two repos. The verifier's DOM
 * probe put `state: "claimed"` and `state: "queued_for_retry"` on a row of every
 * produced Google kind and got a live Approve on all of them.
 *
 * So the vocabulary is now MEASURED against the server's own source, exactly
 * like `features/connectors/__tests__/refusal-codes-are-the-servers-codes.test.ts`
 * and `admission-codes-are-the-servers-codes.test.ts`: the constants are read
 * out of the aidream checkout, the two sets must be equal, and a leg that could
 * not run SAYS SO rather than reading as a pass.
 *
 * 🚨 THE PATH THIS READS, so lane B-18 can keep it working when it extracts the
 * states into their own module: today the declaration lives in
 * `aidream/aidream/services/google_workspace/approvals.py`, as
 * `RECEIPT_APPLYING = "applying"` … one constant per line, beside
 * `RECEIPT_KIND` (the receipt's `__kind` marker, which is NOT a state and is
 * excluded by name). `RECEIPT_SOURCES` below is an ORDERED list of candidate
 * files: put a new module ahead of `approvals.py` and this keeps measuring.
 *
 * AND THE SECOND HALF OF THE SAME LAW: a state the server adds tomorrow must be
 * SAFE here before anyone updates the union. That is what `unrecognized` is for
 * — the census only proves the two lists agree today; `receiptRowMarks` returning
 * an `unknownState` mark, and `noLiveAction` refusing every control over it, is
 * what makes tomorrow's state honest instead of approvable. Both are asserted
 * below, because a census with no runtime behaviour behind it is the V14-4
 * failure wearing a measurement costume.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPROVAL_RECEIPT_SERVER_STATES,
  readApprovalReceipt,
  receiptRowMarks,
  type ApprovalReceiptState,
} from "../receipt";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const GOOGLE_WORKSPACE = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "google_workspace",
);

/**
 * Where the server declares the states, newest home first. Lane B-18 exports
 * them as one module; until it lands, `approvals.py` is the declaration.
 */
const RECEIPT_SOURCES = [
  join(GOOGLE_WORKSPACE, "receipts.py"),
  join(GOOGLE_WORKSPACE, "approvals.py"),
] as const;

function serverSourceFile(): string | null {
  return (
    RECEIPT_SOURCES.find(
      (path) =>
        existsSync(path) && /^RECEIPT_[A-Z_]+ = "/m.test(readFileSync(path, "utf8")),
    ) ?? null
  );
}

/** Every `RECEIPT_* = "value"` the server declares, except the `__kind` marker. */
function statesFromServer(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const found = [...source.matchAll(/^RECEIPT_([A-Z_]+) = "([a-z0-9_]+)"/gm)]
    .filter((match) => match[1] !== "KIND")
    .map((match) => match[2]!);
  if (found.length === 0) {
    throw new Error(
      `${path} no longer declares 'RECEIPT_<NAME> = "<state>"' constants. The ` +
        "client's receipt vocabulary cannot be measured against it — fix this " +
        "reader (or point RECEIPT_SOURCES at the module that now declares them) " +
        "rather than deleting the check.",
    );
  }
  return [...new Set(found)].sort();
}

const serverFile = serverSourceFile();

describe("the receipt vocabulary this build declares", () => {
  it("is exactly the set the sentences and marks answer for", () => {
    for (const state of APPROVAL_RECEIPT_SERVER_STATES) {
      expect(() =>
        receiptRowMarks({ state } as unknown as Record<string, unknown>),
      ).not.toThrow();
    }
  });

  it("narrows a state it has never heard of to `unrecognized`, keeping the word", () => {
    for (const state of ["claimed", "queued_for_retry", "APPLIED"]) {
      const receipt = readApprovalReceipt({ state });
      expect(receipt.state).toBe<ApprovalReceiptState>("unrecognized");
      // The server's word is KEPT, so the row can name it (V14-4's honest row).
      expect(receipt.rawState).toBe(state);
    }
  });

  it("keeps an absent receipt distinct from an unreadable STATE", () => {
    // A pending row that has never been approved carries no receipt at all, and
    // must stay an ordinary waiting row with live controls. Collapsing the two
    // would freeze every fresh proposal in the queue.
    expect(readApprovalReceipt(null).state).toBe("unknown");
    expect(readApprovalReceipt({}).state).toBe("unknown");
    expect(receiptRowMarks(null)).toEqual({});
  });

  it("marks an unrecognized state as a row nobody may act on", () => {
    const marks = receiptRowMarks({ state: "queued_for_retry" });
    expect(marks.unknownState?.state).toBe("queued_for_retry");
    expect(marks.unknownState?.sentence).toContain(
      "a state this screen does not know",
    );
    expect(marks.unknownState?.sentence).toContain("queued_for_retry");
    // It never reads as applied or as failed — the two wrong guesses.
    expect(marks.lastAttempt).toBeUndefined();
    expect(marks.inFlight).toBeUndefined();
  });
});

(serverFile ? describe : describe.skip)(
  "the declared states against the live aidream source",
  () => {
    it("is exactly what apply_google_approval can write", () => {
      expect(statesFromServer(serverFile!)).toEqual(
        [...APPROVAL_RECEIPT_SERVER_STATES].sort(),
      );
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!serverFile) {
    console.warn(
      "UNMEASURED: no aidream receipt declaration was found at any of " +
        `${RECEIPT_SOURCES.join(", ")}, so the receipt states were checked ` +
        "against this build's declared set only. Set AIDREAM_DIR to the sibling " +
        "checkout to measure it.",
    );
  }
  expect(true).toBe(true);
});
