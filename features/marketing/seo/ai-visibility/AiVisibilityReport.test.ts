jest.mock("react-markdown", () => () => null);
jest.mock("remark-gfm", () => () => null);

import {
  ONE_QUESTION_NOT_A_MEASUREMENT,
  parsePublicVisibilityResult,
} from "./AiVisibilityReport";

const baseResult = {
  result_kind: "ai_visibility.analyze",
  site_id: "site-1",
  brand_name: "Acme",
  website_url: "https://acme.example",
  query: "Who should I hire?",
};

describe("parsePublicVisibilityResult", () => {
  it("rejects an all-failed payload instead of rendering an empty report", () => {
    expect(
      parsePublicVisibilityResult({
        ...baseResult,
        providers: [
          {
            engine: "chat_gpt",
            status: "failed",
            error: "SEO collections require active membership",
          },
        ],
      }),
    ).toBeNull();
  });

  it("accepts a partial report with one completed nonblank answer", () => {
    const parsed = parsePublicVisibilityResult({
      ...baseResult,
      providers: [
        { engine: "chat_gpt", status: "completed", answer_text: "Use Acme." },
        { engine: "gemini", status: "failed", error: "upstream unavailable" },
      ],
    });

    expect(parsed?.providers).toHaveLength(2);
  });
});

describe("one-question report honesty line", () => {
  it("says exactly what the brief requires", () => {
    expect(ONE_QUESTION_NOT_A_MEASUREMENT).toBe(
      "One question, one moment. Not a measurement.",
    );
  });
});
