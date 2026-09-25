/**
 * The write-failure toast must never carry a status code, method or path on
 * screen (GATES-TAIL). VERIFIER-23 #6: "The schedule failure toast still
 * shows a status code... The toast reads 'Could not pause this schedule. The
 * server refused (500). Try again...'. It is in words and gives a remedy, but
 * '(500)' is a status code, which the brief rules out." The code stays on the
 * captured error's `technical` field for diagnostics — never on screen.
 */
import { describeWriteFailure, WriteRefusedError } from "../writeFailure";

/** A sentence a person reads must never carry a raw HTTP status, method, or path. */
const LEAKS_TECHNICAL = /\b\d{3}\b|(^|\s)(GET|POST|PUT|PATCH|DELETE)\s+\/|https?:\/\//i;

describe("describeWriteFailure never puts a status code on screen", () => {
  it.each([500, 502, 503, 504, 400, 418, 599])("status %d produces no visible code", (status) => {
    const err = new WriteRefusedError({ status, technical: `PATCH /scheduler/tasks/abc ${status}` });
    const { title, description } = describeWriteFailure(err, { action: "pause this schedule" });
    expect(title).not.toMatch(LEAKS_TECHNICAL);
    expect(description).not.toMatch(LEAKS_TECHNICAL);
  });

  it("keeps the code on the captured error for diagnostics", () => {
    const err = new WriteRefusedError({ status: 500, technical: "PATCH /scheduler/tasks/abc 500" });
    expect(err.status).toBe(500);
    expect(err.technical).toContain("500");
  });

  it("a plain {status} error object also produces no visible code", () => {
    const err = { status: 500, userMessage: null };
    const { description } = describeWriteFailure(err, { action: "pause this schedule" });
    expect(description).not.toMatch(LEAKS_TECHNICAL);
  });
});
