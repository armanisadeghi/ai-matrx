/**
 * The ledger's result vocabulary, both halves of it.
 *
 * RED 6 (Personal Staff register, 2026-09-22): aidream recorded a sign-in that
 * had SUCCEEDED as `failed`, because the honest verdict its verifier produced —
 * "I could not read this page" — had no word in `browser.action_event`. aidream
 * migration 0999 gave it one, `unknown`. This side must parse it and must never
 * show it as a failure.
 */

import { actionResultClass } from "./service";
import type { ActionResultClass } from "./types";

const EVERY_WORD: ActionResultClass[] = [
  "ok",
  "failed",
  "unknown",
  "timeout",
  "conflict",
  "blocked_by_human_control",
  "refused_by_policy",
  "suppressed",
  "cancelled",
];

describe("actionResultClass", () => {
  it("parses every word the database CHECK allows", () => {
    for (const word of EVERY_WORD) {
      expect(actionResultClass(word)).toBe(word);
    }
  });

  it("parses `unknown` — an unreadable outcome is not a failed one", () => {
    expect(actionResultClass("unknown")).toBe("unknown");
    expect(actionResultClass("unknown")).not.toBe("failed");
  });

  it("still refuses a word nobody defined, loudly", () => {
    expect(() => actionResultClass("probably_fine")).toThrow(
      /Unknown browser action result/,
    );
  });
});
