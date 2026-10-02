import { ambientAssistantMandateChain } from "../ambientAssistantMandates";

describe("ambientAssistantMandateChain", () => {
  it("uses the shared system Mandate outside configured modules", () => {
    expect(ambientAssistantMandateChain("/marketing/notes")).toEqual({
      system: "ambient.page_guidance",
      module: undefined,
      page: undefined,
    });
  });

  it("adds the Notes module override", () => {
    expect(ambientAssistantMandateChain("/notes/example")).toEqual({
      system: "ambient.page_guidance",
      module: "notes.page_guidance",
      page: undefined,
    });
  });

  it("adds the Education section override above the module", () => {
    expect(
      ambientAssistantMandateChain("/education/flashcards/set-id/study"),
    ).toEqual({
      system: "ambient.page_guidance",
      module: "education.page_guidance",
      page: "education.flashcards_guidance",
    });
  });
});
