/**
 * The refusal reader — the one thing standing between a door's "no" and a
 * screen that invents a reason for it.
 *
 * V-XT-2/N2 (2026-09-15): `/work/conversations/<id>` rendered "You do have
 * access to it — something went wrong on our side. Try again." for a
 * conversation the server had refused with `404 conversation_not_found`.
 */
import { readServerRefusal } from "./serverRefusal";

describe("readServerRefusal", () => {
  it("returns the server's own sentence and code, verbatim", () => {
    const refusal = readServerRefusal({
      status: 404,
      message: "HTTP 404",
      serverDetail: {
        code: "conversation_not_found",
        message: "No conversation found with id='9e015853-…'.",
      },
    });
    expect(refusal).toEqual({
      code: "conversation_not_found",
      message: "No conversation found with id='9e015853-…'.",
      issues: [],
      status: 404,
    });
  });

  it("prefers the purpose-written user_message over the bare message", () => {
    const refusal = readServerRefusal({
      status: 403,
      serverDetail: {
        detail: {
          code: "forbidden",
          message: "forbidden",
          user_message: "This belongs to another account.",
        },
      },
    });
    expect(refusal?.message).toBe("This belongs to another account.");
    expect(refusal?.code).toBe("forbidden");
  });

  it("is silent for a failure that is not a refusal, so a real fault keeps its retry", () => {
    // A fault has no door words: replacing the platform's own honest "that
    // failed on our side, try again" here would be its own lie.
    expect(readServerRefusal({ status: 500, message: "HTTP 500" })).toBeNull();
    expect(readServerRefusal(new TypeError("fetch failed"))).toBeNull();
    expect(readServerRefusal(null)).toBeNull();
    // A null-row RLS read: no error object at all.
    expect(readServerRefusal(undefined)).toBeNull();
  });

  it("never prints a bare transport code or a sentence that blames the reader", () => {
    const refusal = readServerRefusal({
      status: 400,
      message: "HTTP 400",
      serverDetail: {
        code: "bad_request",
        message: "Bad request. Please check your input.",
      },
    });
    expect(refusal?.message).not.toContain("HTTP 400");
    expect(refusal?.message).not.toContain("check your input");
    // The silence is named as the silence, with the code that identifies it.
    expect(refusal?.message).toContain("bad_request");
  });
});
