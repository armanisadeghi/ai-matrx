import { deriveVariableMapping } from "@/features/page-extraction/utils/derive-variable-mapping";

describe("deriveVariableMapping", () => {
  it("maps a Document variable to the native PDF chunk instead of filename", () => {
    expect(
      deriveVariableMapping(
        [
          { name: "document", customComponent: { type: "document" } },
          { name: "source_filename" },
        ],
        ["clean_text", "pdf_page"],
      ),
    ).toEqual({
      pdf_page: "document",
      filename: "source_filename",
    });
  });
});
