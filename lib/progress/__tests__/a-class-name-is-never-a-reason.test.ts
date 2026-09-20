/**
 * THE GUARD: a raw exception class name never reaches a person, and a failure
 * sentence always carries a remedy.
 *
 * The transcript is the twelfth cold walk's D2, verbatim off the screen
 * (common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/
 * cold-walk-12, screenshots/34_distill_done.png): five of seven sources in a
 * Rulebook's file pile reported
 *
 *   Reading “02_controller_reprogram_cases.md” failed (AppError). Nothing was
 *   added to your Rulebook.
 *
 * — a base class name where the reason belonged, and no remedy.
 *
 * PROVEN FAILING FIRST: with `humanFailureSentence` reduced to the identity
 * function (`{ text: raw ?? "", saidWhy: true }`), every assertion below that
 * names `AppError`, `saidWhy` or the remedy goes red. Recorded 2026-09-20.
 */

import {
  humanFailureSentence,
  namesAnExceptionClass,
  providerErrorSentence,
} from "../failureSentence";

const WALK_12_D2 =
  "Reading “02_controller_reprogram_cases.md” failed (AppError). Nothing was added to your Rulebook.";

describe("a class name is never a reason", () => {
  it("strips the class name the twelfth cold walk saw five times", () => {
    const { text } = humanFailureSentence(WALK_12_D2);
    expect(text).not.toContain("AppError");
    expect(namesAnExceptionClass(text)).toBe(false);
  });

  it("says out loud that the server did not explain itself", () => {
    const { saidWhy, text } = humanFailureSentence(WALK_12_D2);
    expect(saidWhy).toBe(false);
    expect(text).toContain("did not say why");
  });

  it("attaches a remedy whenever it gave the person nothing to act on", () => {
    for (const raw of [
      WALK_12_D2,
      "AppError",
      "",
      null,
      "Reading “book.epub” failed (ValueError).",
    ]) {
      const { text, saidWhy } = humanFailureSentence(raw);
      expect(saidWhy).toBe(false);
      expect(text.toLowerCase()).toContain("try it again");
    }
  });

  it("never bolts “try it again” onto a refusal that can never succeed", () => {
    // The copy-protection refusal names four lawful ways in. Telling the
    // person to re-run the read instead would be a remedy that is a lie.
    const drm =
      "“protected-novel.epub” is copy-protected (Adobe ADEPT), so we cannot read it — and we will never strip a publisher’s protection. What does work: a DRM-free copy of the same book.";
    const { text, saidWhy } = humanFailureSentence(drm);
    expect(saidWhy).toBe(true);
    expect(text.toLowerCase()).not.toContain("try it again");
    expect(text).toContain("DRM-free copy");
    // And a parenthesised phrase that is NOT an exception class survives
    // untouched — "(Adobe ADEPT)" names the scheme, which is the point.
    expect(text).toContain("(Adobe ADEPT)");
  });

  it("leaves a REAL cause exactly as the server wrote it", () => {
    // aidream 3e51a3e865: `report_sub_pipeline_failure` now returns the real
    // sentence. A client that rewrote or truncated it would undo that fix.
    const real =
      'null value in column "organization_id" of relation "page_extraction_run" violates not-null constraint.';
    const { text, saidWhy } = humanFailureSentence(real);
    expect(saidWhy).toBe(true);
    expect(text).toContain("organization_id");
  });

  it("keeps a sentence that mentions an error in prose", () => {
    const prose =
      "YouTube would not answer what captions this video has — it asked the server to prove it is not a robot.";
    const { text, saidWhy } = humanFailureSentence(prose);
    expect(saidWhy).toBe(true);
    expect(text).toContain("prove it is not a robot");
  });

  it("recognises a class name wherever it is written", () => {
    expect(namesAnExceptionClass("failed (AppError).")).toBe(true);
    expect(namesAnExceptionClass("AppError")).toBe(true);
    expect(namesAnExceptionClass("failed (asyncio.TimeoutError)")).toBe(true);
    expect(namesAnExceptionClass("the server returned an error page")).toBe(
      false,
    );
  });
});

/**
 * `providerErrorSentence` — the acquisition console defect (cold-walk-13,
 * common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/
 * cold-walk-13/README.md, Friction): "Raw provider tokens on the acquisition
 * console: `LOGIN_REQUIRED` and `ProxyError` inside otherwise excellent
 * person-facing sentences." Unlike `humanFailureSentence`, the value in hand
 * here IS the token — a bare enum or exception-class value, not a sentence
 * with one embedded.
 */
describe("providerErrorSentence — a bare provider token is never the sentence", () => {
  it("gives LOGIN_REQUIRED a plain sentence", () => {
    const { text, detail } = providerErrorSentence("LOGIN_REQUIRED");
    expect(text).not.toContain("LOGIN_REQUIRED");
    expect(text.toLowerCase()).toContain("sign in");
    expect(detail).toBeUndefined();
  });

  it("gives ProxyError a plain sentence", () => {
    const { text, detail } = providerErrorSentence("ProxyError");
    expect(text).not.toContain("ProxyError");
    expect(text.toLowerCase()).toContain("connection");
    expect(detail).toBeUndefined();
  });

  it("never folds an unrecognised token into the sentence, but keeps it as detail", () => {
    const { text, detail } = providerErrorSentence("WeirdVendorSpecificCode99");
    expect(text).not.toContain("WeirdVendorSpecificCode99");
    expect(text.toLowerCase()).toContain("a provider error");
    expect(detail).toBe("WeirdVendorSpecificCode99");
  });

  it("has no detail and a plain sentence for an empty token", () => {
    for (const empty of [null, undefined, ""]) {
      const { text, detail } = providerErrorSentence(empty);
      expect(text.length).toBeGreaterThan(0);
      expect(detail).toBeUndefined();
    }
  });
});
