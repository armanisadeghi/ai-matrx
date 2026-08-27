import { readFileSync } from "node:fs";
import { join } from "node:path";

const studioShell = readFileSync(join(__dirname, "StudioShell.tsx"), "utf8");
const inspectorRail = readFileSync(
  join(__dirname, "InspectorRail.tsx"),
  "utf8",
);
const thumbnailStrip = readFileSync(
  join(__dirname, "ThumbnailStrip.tsx"),
  "utf8",
);
const pdfEditTab = readFileSync(
  join(__dirname, "../../files/components/surfaces/single-file/PdfEditTab.tsx"),
  "utf8",
);
const filePreview = readFileSync(
  join(__dirname, "../../files/components/core/FilePreview/FilePreview.tsx"),
  "utf8",
);

describe("PDF annotation surface responsive contract", () => {
  it("keeps tablet and mobile annotation controls at the 44px floor", () => {
    expect(studioShell).toContain("max-lg:min-h-11 max-lg:min-w-11");
    expect(pdfEditTab).toContain("max-lg:min-h-11 max-lg:min-w-11");
    expect(inspectorRail).toContain("max-lg:min-h-11");
    expect(thumbnailStrip).toContain(
      "max-lg:h-11 max-lg:w-11 max-lg:opacity-100",
    );
  });

  it("routes the PDF preview Edit handoff to the canonical studio", () => {
    expect(filePreview).toContain('capability.previewKind === "pdf"');
    expect(filePreview).toContain(
      "`/files/f/${encodeURIComponent(fileId)}/studio`",
    );
  });
});
