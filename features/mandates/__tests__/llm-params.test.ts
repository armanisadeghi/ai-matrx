import { toLlmParams } from "../llm-params";
import { REASONING_SUMMARY_OPTIONS } from "@/types/python-generated/llm-enums";

describe("mandate config projection", () => {
  afterEach(() => jest.restoreAllMocks());

  test.each(REASONING_SUMMARY_OPTIONS)(
    "preserves supported reasoning_summary=%s without an unsupported-key warning",
    (reasoningSummary) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(
        toLlmParams({
          reasoning_summary: reasoningSummary,
          reasoning_effort: "low",
        }),
      ).toEqual({
        reasoning_summary: reasoningSummary,
        reasoning_effort: "low",
      });
      expect(warn).not.toHaveBeenCalled();
    },
  );

  test("does not reinterpret an invalid summary or null as a valid enum", () => {
    expect(toLlmParams({ reasoning_summary: "hidden" })).not.toHaveProperty(
      "reasoning_summary",
    );
    expect(toLlmParams({ reasoning_summary: null })).not.toHaveProperty(
      "reasoning_summary",
    );
  });
});
