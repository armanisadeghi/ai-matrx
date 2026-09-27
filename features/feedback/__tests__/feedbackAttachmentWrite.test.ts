import { parseFeedbackAttachment } from "../feedbackDraftWrite";

const ID = "3f2b8c1e-8d4a-4e2b-9a1c-0d9e8f7a6b5c";

describe("parseFeedbackAttachment", () => {
  it("accepts one existing file by id, with an optional name", () => {
    expect(parseFeedbackAttachment({ file_id: ID })).toEqual({ fileId: ID });
    expect(parseFeedbackAttachment({ file_id: ID, name: "repro.png" })).toEqual({ fileId: ID, name: "repro.png" });
  });
  it("refuses URLs, strings, unknown keys and blank names — by name", () => {
    expect(() => parseFeedbackAttachment({ file_id: "https://x/y.png" })).toThrow(/UUID/);
    expect(() => parseFeedbackAttachment(ID)).toThrow(/object/);
    expect(() => parseFeedbackAttachment({ file_id: ID, url: "x" })).toThrow(/url/);
    expect(() => parseFeedbackAttachment({ file_id: ID, name: " " })).toThrow(/name/);
  });
});
