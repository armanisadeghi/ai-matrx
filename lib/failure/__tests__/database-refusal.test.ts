/**
 * THE GUARD for wall W2: Postgres's own words must never become a screen's
 * words.
 *
 * ## The defect
 *
 * On 2026-09-15 an Expert on `/masterwork/new?approach=interview` was shown, on
 * the page and again in a toast:
 *
 *     canceling statement due to statement timeout (57014)
 *
 * `describeFailure` passed every non-transport error through as the sentence,
 * on the reasoning that "a door's own refusal passes through word for word".
 * The engine's SQLSTATE prose is not a door's refusal — it is written for an
 * operator, it names no remedy, and it told the Expert nothing she could act
 * on. It is also, unlike a permission decision, a TRANSIENT condition: a retry
 * is the correct remedy and the screen must offer one.
 *
 * ## The SUT and what is real
 *
 * `describeFailure` / `databaseRefusal` in `lib/failure/transport.ts`. Nothing
 * is stubbed — the classifier and the sentence table are the code under test.
 * The inputs are the PostgREST error shapes supabase-js actually delivers
 * (`{ message, code }`), including the one captured from the live wall.
 *
 * ## Why a constant cannot pass
 *
 * The four refusal classes have FOUR different sentences and three different
 * remedies, and the two non-refusals must come back unchanged with
 * `transient: false`. `return expected` for any one of them fails the others.
 *
 * ## Proven red before green (2026-09-15)
 *
 * Against `transport.ts` without `databaseRefusal`, every case in
 * "the engine's prose never becomes the sentence" fails: `describeFailure`
 * returned `"canceling statement due to statement timeout"` as `sentence`, and
 * `transient` was `false`, so no screen would have offered a retry.
 */

import {
  databaseRefusal,
  describeFailure,
  failureLine,
  isDatabaseFailure,
} from "@/lib/failure/transport";

/** The shape supabase-js hands a caller, and the shape our registry read
 *  rethrows. Both must classify identically — the code is what carries. */
function pgError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The exact error the wall produced, captured from the live failure. */
const THE_WALL = pgError(
  "57014",
  "canceling statement due to statement timeout",
);

describe("the engine's prose never becomes the sentence", () => {
  it.each([
    ["57014", "canceling statement due to statement timeout", "timeout"],
    ["53300", "sorry, too many clients already", "busy"],
    ["57P01", "terminating connection due to administrator command", "busy"],
    ["40001", "could not serialize access due to concurrent update", "conflict"],
    ["40P01", "deadlock detected", "conflict"],
    ["08006", "connection to server was lost", "dropped"],
  ])("classifies SQLSTATE %s as a %s refusal", (code, message, kind) => {
    const error = pgError(code, message);
    expect(databaseRefusal(error)).toBe(kind);
    expect(isDatabaseFailure(error)).toBe(true);
    expect(describeFailure(error).sentence).not.toContain(message);
  });

  it("gives each class of refusal its own sentence, not one blanket line", () => {
    const sentences = [
      "57014:canceling statement due to statement timeout",
      "53300:sorry, too many clients already",
      "40001:could not serialize access due to concurrent update",
      "08006:connection to server was lost",
    ].map((spec) => {
      const [code, message] = [spec.slice(0, 5), spec.slice(6)];
      return describeFailure(pgError(code, message), { action: "saving this" })
        .sentence;
    });
    expect(new Set(sentences).size).toBe(4);
  });

  it("says a cancelled statement changed nothing, because it rolled back", () => {
    const failure = describeFailure(THE_WALL, {
      action: "loading the ways to get started",
    });
    expect(failure.sentence).toMatch(/nothing was changed/i);
    expect(failure.sentence).toContain("loading the ways to get started");
  });

  it("does NOT claim a dropped connection changed nothing — nobody knows", () => {
    const failure = describeFailure(
      pgError("08006", "connection to server was lost"),
      { action: "saving this rule" },
    );
    expect(failure.sentence).toMatch(/may or may not/i);
    expect(failure.sentence).not.toMatch(/nothing was changed/i);
  });

  it("marks every refusal transient, so the screen offers a retry", () => {
    for (const code of ["57014", "53300", "40001", "08006"]) {
      const failure = describeFailure(pgError(code, "engine prose"));
      expect(failure.transient).toBe(true);
      expect(failure.remedy).toMatch(/try again/i);
    }
  });

  it("recognises the engine's phrasing when the SQLSTATE was lost on the way", () => {
    // A message that was stringified into a plain Error somewhere upstream.
    const stringified = new Error(
      "canceling statement due to statement timeout",
    );
    expect(databaseRefusal(stringified)).toBe("timeout");
    expect(describeFailure(stringified).sentence).not.toContain(
      "canceling statement",
    );
  });

  it("keeps the raw prose for the Error Inspector, never for the screen", () => {
    const failure = describeFailure(THE_WALL);
    expect(failure.raw).toBe("canceling statement due to statement timeout");
    expect(failureLine(THE_WALL)).not.toContain("canceling statement");
    expect(failureLine(THE_WALL)).not.toContain("57014");
  });
});

describe("a decision is not a refusal — those still pass through", () => {
  it.each([
    // Permission is an answer, not a failure to answer: the caller owns what
    // to say about it, and a retry would be a lie.
    [pgError("42501", "permission denied for table approach")],
    // A sentence one of our own functions raised for a person.
    [
      pgError(
        "P0001",
        "This Rulebook is locked while a review is open. Close the review first.",
      ),
    ],
    [new Error("We couldn't open this mandate. It may have been deleted.")],
  ])("leaves %p alone", (error) => {
    expect(isDatabaseFailure(error)).toBe(false);
    const failure = describeFailure(error);
    expect(failure.sentence).toBe((error as Error).message);
    expect(failure.transient).toBe(false);
  });

  it("does not rewrite our own sentence merely for quoting a timeout", () => {
    const ours = new Error(
      "That report is too large to build here, and the database timeout stopped it. Narrow the date range and try again.",
    );
    expect(isDatabaseFailure(ours)).toBe(false);
    expect(describeFailure(ours).sentence).toBe(ours.message);
  });
});
