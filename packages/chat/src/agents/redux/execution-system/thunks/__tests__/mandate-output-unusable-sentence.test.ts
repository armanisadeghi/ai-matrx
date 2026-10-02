/**
 * `mandateOutputUnusableSentence` is the ONE reader every lane uses to pull
 * the plain "the chosen agent cannot answer this job" sentence back out of a
 * `HeadlessAgentJsonResult` — so a lane that swallows failures to `null` (its
 * non-AI fallback is already on screen) can still SAY this one specific
 * failure instead of going silent (flashcards' typed grading + micro-coach,
 * and every job family swept in after them).
 *
 * RED on the old tree: this helper did not exist, so every lane's `catch`
 * dropped the sentence `failWarnedOutputMissingKeys` had already built.
 */
import { mandateOutputUnusableSentence } from "../run-headless-agent-json";

const SENTENCE =
  "Quick Test Agent ran, but its answer is missing result, explanation this job needs, so nothing was saved. " +
  "It was chosen although it does not declare those keys — pick one that does.";

describe("mandateOutputUnusableSentence", () => {
  it("reads the sentence off a mandate_output_unusable failure", () => {
    const result = {
      success: false as const,
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing result, explanation",
    };
    expect(mandateOutputUnusableSentence(result)).toBe(SENTENCE);
  });

  it("is null for a successful run", () => {
    const result = { success: true as const, error: undefined, errorDetail: undefined };
    expect(mandateOutputUnusableSentence(result)).toBeNull();
  });

  it("is null for any other failure (timeout, launch error, …)", () => {
    const result = { success: false as const, error: "timed out", errorDetail: undefined };
    expect(mandateOutputUnusableSentence(result)).toBeNull();
  });

  it("is null when errorDetail exists but isn't the unusable-output tag", () => {
    const result = {
      success: false as const,
      error: "no JSON extracted",
      errorDetail: "no_json",
    };
    expect(mandateOutputUnusableSentence(result)).toBeNull();
  });
});
