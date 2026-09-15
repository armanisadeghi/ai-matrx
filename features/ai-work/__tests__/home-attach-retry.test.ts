/**
 * Filing a run under its Home picks: retry the race, never the verdict.
 *
 * THE DEFECT (XT-FIX-3 follow-up, 2026-09-15). The composer decided whether to
 * retry by sniffing the strings "access" / "not authorized" / "not found" out
 * of the failure message — and measurement shows that rule was wrong in BOTH
 * directions. `@ai-matrx/associations` maps SQLSTATE 42501 (every access
 * refusal `assoc_add` raises, the not-committed-yet race included) to the
 * message "Permission denied", which matches none of the three substrings: the
 * race it was written for was never retried at all. Meanwhile `not_found`
 * ("Not found") and unmapped pg sentences carrying the word "access" were
 * retried four times for nothing.
 *
 * THE SHAPES BELOW ARE PINNED FROM PRODUCTION, measured on 2026-09-15 as
 * `test@test.com` against the live database, read-only (each call was designed
 * to fail, inside a transaction that was rolled back):
 *
 *   row does not exist yet  → 42501 "assoc_add: editor access to both
 *                             endpoints is required for an access-conveying edge"
 *   row belongs to somebody → 42501, the SAME sentence
 *   row this account owns   → succeeds
 *
 * They are byte-identical, so no reading of the error can separate them. The
 * separation is the CAUSE: can this caller read the conversation row yet.
 */
import {
  ASSOC_ACCESS_REFUSAL_CODE,
  decideHomeAttachRetry,
} from "../compose/homeAttach";
import { readTypedRefusal } from "@/features/access-gate/service/serverRefusal";

/** Exactly what `@ai-matrx/associations` hands back for SQLSTATE 42501. */
const ACCESS_REFUSAL = {
  code: "forbidden_org",
  message: "Permission denied",
  detail: {
    code: "42501",
    message:
      "assoc_add: editor access to both endpoints is required for an access-conveying edge",
  },
};

describe("decideHomeAttachRetry", () => {
  it("retries the race: the same refusal while the conversation row is not readable yet", () => {
    expect(
      decideHomeAttachRetry(readTypedRefusal(ACCESS_REFUSAL), false),
    ).toBe("retry");
  });

  it("stops on the verdict: the SAME refusal once the row IS readable", () => {
    // Identical error. Only the observed cause differs.
    expect(decideHomeAttachRetry(readTypedRefusal(ACCESS_REFUSAL), true)).toBe(
      "stop",
    );
  });

  it("never retries a refusal that is a verdict by construction", () => {
    for (const code of [
      "invalid_argument",
      "not_found",
      "unauthorized",
      "conflict_in_use",
      "version_conflict",
      "quota_exceeded",
      "demanded_schema_violation",
      "internal",
    ]) {
      expect(
        decideHomeAttachRetry(
          readTypedRefusal({ code, message: "No." }),
          false,
        ),
      ).toBe("stop");
    }
  });

  it("never retries a failure that carries no code at all", () => {
    // A thrown TypeError, an aborted fetch: nothing here says "too early".
    expect(decideHomeAttachRetry(readTypedRefusal(new TypeError("boom")), false)).toBe(
      "stop",
    );
    expect(decideHomeAttachRetry(null, false)).toBe("stop");
  });

  it("reads the server's own code and sentence, verbatim, for the report", () => {
    const refusal = readTypedRefusal(ACCESS_REFUSAL);
    expect(refusal).not.toBeNull();
    expect(refusal?.code).toBe(ASSOC_ACCESS_REFUSAL_CODE);
    expect(refusal?.message).toBe("Permission denied");
  });
});
