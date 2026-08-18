import { shouldCreateOptimisticUserMessage } from "../messages.slice";

const EMPTY_SUBMISSION = {
  hasText: false,
  hasAttachments: false,
  hasVariables: false,
  hasContext: false,
};

describe("shouldCreateOptimisticUserMessage", () => {
  test.each([
    ["text", { hasText: true }],
    ["attachments", { hasAttachments: true }],
    ["variables only", { hasVariables: true }],
    ["context only", { hasContext: true }],
  ])("creates the live user row for %s", (_label, facet) => {
    expect(
      shouldCreateOptimisticUserMessage({ ...EMPTY_SUBMISSION, ...facet }),
    ).toBe(true);
  });

  test("does not create a blank row or a second row for retry", () => {
    expect(shouldCreateOptimisticUserMessage(EMPTY_SUBMISSION)).toBe(false);
    expect(
      shouldCreateOptimisticUserMessage({
        ...EMPTY_SUBMISSION,
        hasVariables: true,
        isRetry: true,
      }),
    ).toBe(false);
  });
});
