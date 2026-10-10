/**
 * An image's Edit must never open the code editor (it showed the PNG's raw
 * bytes on a phone). Every binary kind is mapped away from "text-editor".
 */
import { editHandoffFor, requestEditTab } from "./edit-handoff";

describe("Edit hand-off by kind", () => {
  it.each(["image", "pdf", "audio", "video", "office", "spreadsheet", "archive", "generic"] as const)(
    "%s never opens the text editor",
    (kind) => {
      expect(editHandoffFor(kind as never)).not.toBe("text-editor");
    },
  );
  it.each(["code", "markdown", "text", "svg", "html"] as const)("%s opens the text editor", (kind) => {
    expect(editHandoffFor(kind as never)).toBe("text-editor");
  });
  it("image -> image editor, pdf -> studio", () => {
    expect(editHandoffFor("image")).toBe("image-editor");
    expect(editHandoffFor("pdf")).toBe("pdf-studio");
  });
  it("requestEditTab reports whether a viewer took the request", () => {
    expect(requestEditTab("f-1")).toBe(false);
    const take = (e: Event) => {
      (e as CustomEvent).detail.handled = true;
    };
    window.addEventListener("cloud-files:open-preview-tab", take);
    expect(requestEditTab("f-1")).toBe(true);
    window.removeEventListener("cloud-files:open-preview-tab", take);
  });
});
