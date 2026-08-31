import { getFilePreviewProfile } from "./file-types";

describe("SVG preview classification", () => {
  it.each(["application/xml", "text/xml"])(
    "keeps a .svg file on the SVG viewer when uploaded as %s",
    (mimeType) => {
      const profile = getFilePreviewProfile("matrx-icon.svg", mimeType, 1_100);

      expect(profile.previewKind).toBe("svg");
      expect(profile.details.subCategory).toBe("SVG");
      expect(profile.thumbnailStrategy).toBe("image");
    },
  );

  it("keeps a real .xml file on the data viewer", () => {
    expect(
      getFilePreviewProfile("document.xml", "application/xml", 1_100)
        .previewKind,
    ).toBe("data");
  });
});
