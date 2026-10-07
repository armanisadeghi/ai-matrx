jest.mock("@univerjs/core", () => ({
  CellValueType: { STRING: 1, NUMBER: 2, BOOLEAN: 3 },
}));
jest.mock("@univerjs/presets", () => ({
  LocaleType: { EN_US: "en-US" },
}));
jest.mock("@/features/documents/document-service", () => ({
  createDocument: jest.fn(),
  saveDocumentSnapshot: jest.fn(),
}));
jest.mock("@/features/workbooks/workbook-service", () => ({
  createWorkbook: jest.fn(),
  saveSnapshot: jest.fn(),
}));
jest.mock("@/features/data-tables/types", () => ({
  isServiceFailure: (value: unknown) =>
    Boolean(value && typeof value === "object" && "error" in value),
}));
jest.mock("@/features/documents/markdown-to-univer-doc", () => ({
  deriveDocumentName: () => "Derived title",
  markdownToUniverDoc: () => ({ id: "snapshot" }),
}));

import { createDocument, saveDocumentSnapshot } from "@/features/documents/document-service";
import { createWorkbook, saveSnapshot } from "@/features/workbooks/workbook-service";
import { pushMarkdownToDocument, pushTableToWorkbook } from "./export-targets";

describe("export targets partial creation", () => {
  beforeEach(() => jest.resetAllMocks());

  it("keeps the created document destination when its initial snapshot save fails", async () => {
    jest.mocked(createDocument).mockResolvedValue({ data: { id: "document-42" } } as never);
    jest.mocked(saveDocumentSnapshot).mockResolvedValue({ error: "snapshot write refused" } as never);

    await expect(pushMarkdownToDocument("# Exact source", "Source title", "org-1")).resolves.toEqual({
      ok: false,
      id: "document-42",
      href: "/documents/document-42",
      error: expect.stringMatching(/created.*do not create another copy.*snapshot write refused/i),
    });
  });

  it("keeps the created workbook destination when snapshot persistence throws", async () => {
    jest.mocked(createWorkbook).mockResolvedValue({ data: { id: "workbook-42" } } as never);
    jest.mocked(saveSnapshot).mockRejectedValue(new Error("connection lost"));

    await expect(
      pushTableToWorkbook({ name: "Revenue", headers: ["Month"], rows: [["January"]] }, "org-1"),
    ).resolves.toEqual({
      ok: false,
      id: "workbook-42",
      href: "/workbooks/workbook-42",
      error: expect.stringMatching(/created.*do not create another copy.*connection lost/i),
    });
  });
});
