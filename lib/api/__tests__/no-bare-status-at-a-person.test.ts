/**
 * 🚨 A TRANSPORT CODE IS NEVER A SENTENCE — V-PARITY/UX F4, second half.
 *
 * Read off the deployed admin panel (`/administration/mandates/{key}`,
 * v0.4.1728), verbatim and twice:
 *
 *   "This job's inputs could not be read: HTTP 400"
 *
 * and a bare "HTTP 400" where the input surface should have been. `error.message`
 * is what every surface prints, and its fallback was `` `HTTP ${status}` `` —
 * so a person got a number with no cause and no remedy. The fourth law, broken
 * one inch from the screen.
 *
 * The fix is at the CLASS, in `call-api.ts`, because every `callApi` consumer in
 * the repo inherits that fallback — fixing only the surface the walk stood on
 * would have left the rest saying "HTTP 500". The status is not lost: it rides
 * `error.status`, which is what code branches on. This guard is about the words.
 */
import { bareStatusSentence } from "../call-api";

const BARE = /^HTTP \d{3}$/;

describe("bareStatusSentence — words, never a status code", () => {
  const statuses = [400, 401, 403, 404, 409, 422, 429, 500, 502, 504];

  it.each(statuses)("%i is answered with a sentence, not a number", (status) => {
    const said = bareStatusSentence(status);

    // 🚨 THE DEFECT, ASSERTED ABSENT.
    expect(said).not.toMatch(BARE);
    expect(said).not.toContain(`HTTP ${status}`);
    expect(said).not.toContain(String(status));

    // A sentence: it ends like one, and it is long enough to have said
    // something. A three-word placeholder would pass a "not a number" check.
    expect(said.length).toBeGreaterThan(40);
    expect(said.trim()).toMatch(/[.!]$/);
  });

  it.each(statuses)("%i names an action the reader can take", (status) => {
    // NOTHING FAILS SILENTLY: every stand-in announces itself WITH A REMEDY.
    // A sentence that only describes the failure leaves the reader stuck.
    expect(bareStatusSentence(status)).toMatch(
      /try again|Try again|Reload|Sign in|Wait|report it|administrator/,
    );
  });

  it("says so when the server refused with no reason at all", () => {
    // The honest version of "HTTP 400": the missing explanation is the server's
    // defect, not the reader's mistake, and the screen says which.
    const said = bareStatusSentence(400);
    expect(said).toContain("sent no reason");
    expect(said.toLowerCase()).toContain("defect");
  });

  it("does not blame the reader for a server failure", () => {
    expect(bareStatusSentence(500)).toContain("The server failed");
    expect(bareStatusSentence(500)).not.toContain("your mistake");
  });
});
