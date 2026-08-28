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
const previewerActionBar = readFileSync(
  join(
    __dirname,
    "../../files/components/core/FilePreview/PreviewerActionBar/PreviewerActionBar.tsx",
  ),
  "utf8",
);
const fileTabsBody = readFileSync(
  join(__dirname, "../../files/components/surfaces/FileTabsBody.tsx"),
  "utf8",
);
const regionContextMenu = readFileSync(
  join(__dirname, "../components/RegionContextMenu.tsx"),
  "utf8",
);

describe("PDF annotation surface responsive contract", () => {
  it("keeps tablet and mobile annotation controls at the 44px floor", () => {
    expect(studioShell).toContain("max-lg:min-h-11 max-lg:min-w-11");
    expect(pdfEditTab).toContain("max-lg:min-h-11 max-lg:min-w-11");
    expect(inspectorRail).toContain("max-lg:min-h-11");
    expect(thumbnailStrip).toContain(
      "max-lg:h-11 max-lg:min-w-11 max-lg:shrink-0 max-lg:opacity-100",
    );
    expect(previewerActionBar).toContain("max-lg:min-h-11 max-lg:min-w-11");
    expect(previewerActionBar).toContain(
      "max-lg:h-11 max-lg:w-11 max-lg:min-w-11 max-lg:shrink-0",
    );
    expect(fileTabsBody).toContain("max-lg:min-h-11");
  });

  it("keeps the mobile Studio mode row inside the viewport", () => {
    expect(studioShell).toContain(
      "max-sm:order-last max-sm:ml-0 max-sm:w-full max-sm:justify-center",
    );
  });

  it("routes the PDF preview Edit handoff to the canonical studio", () => {
    expect(filePreview).toContain('capability.previewKind === "pdf"');
    expect(filePreview).toContain(
      "`/files/f/${encodeURIComponent(fileId)}/studio`",
    );
  });

  it("keeps selected PDF region actions reachable through the mobile drawer", () => {
    expect(studioShell).toContain(
      "selectedAnnotationId={selectedAnnotationId}",
    );
    expect(pdfEditTab).toContain("selectedAnnotationId={selectedAnnotationId}");
    expect(regionContextMenu).toContain('aria-label="Region actions"');
    expect(regionContextMenu).toContain("<ItemMenu");
    expect(regionContextMenu).toContain("min-h-11");
    expect(regionContextMenu).toContain(
      'className="absolute bottom-3 right-3 z-30 md:hidden"',
    );
  });
});
