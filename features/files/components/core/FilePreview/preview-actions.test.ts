import { buildPreviewActions } from "./preview-actions";

const NOOP = () => {};
const BASE = {
  onDownload: NOOP,
  onCopyLink: NOOP,
  onOpenFullView: NOOP,
  onRename: NOOP,
  onDelete: NOOP,
};

describe("buildPreviewActions PDF extraction", () => {
  it("offers background text extraction for a real PDF", () => {
    const actions = buildPreviewActions({
      ...BASE,
      file: { source: { kind: "real" } },
      previewKind: "pdf",
      onExtractText: NOOP,
    });

    expect(actions.map((action) => action.id)).toContain("extract-text");
  });

  it("does not offer PDF extraction for virtual or non-PDF files", () => {
    const virtualPdf = buildPreviewActions({
      ...BASE,
      file: {
        source: { kind: "virtual", adapterId: "notes", virtualId: "note-1" },
      },
      previewKind: "pdf",
      onExtractText: NOOP,
    });
    const realImage = buildPreviewActions({
      ...BASE,
      file: { source: { kind: "real" } },
      previewKind: "image",
      onExtractText: NOOP,
    });

    expect(virtualPdf.map((action) => action.id)).not.toContain("extract-text");
    expect(realImage.map((action) => action.id)).not.toContain("extract-text");
  });
});
