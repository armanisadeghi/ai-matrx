import { getVisibleResourcePickerCategories } from "../resource-picker-menu-items";

describe("getVisibleResourcePickerCategories", () => {
  it("limits a reused picker to the resource kinds supported by its host", () => {
    const categories = getVisibleResourcePickerCategories(undefined, {
      allowedViewIds: ["files", "notes"],
    });

    expect(
      categories.flatMap((category) => category.items.map((item) => item.id)),
    ).toEqual(["files", "notes"]);
    expect(categories.map((category) => category.category)).toEqual([
      "",
      "Attach/Associate",
    ]);
  });

  it("offers exactly ONE Files entry — upload and stored files are unified", () => {
    const categories = getVisibleResourcePickerCategories();
    const primary = categories.find((c) => c.category === "");

    // One "files" row (Voice Pad / Tools / Skills are conversation-gated).
    // `google` (d840ed7b40) and `cloud_browser` (38d7d71d45, Arman's
    // 2026-08-21 ruling that the browser entry point lives in THIS menu and
    // nowhere else) joined the primary list after this guard was written —
    // both are deliberate rows, so the list they belong to is what gets
    // pinned. What the guard is actually protecting is below: ONE files row,
    // never a second "upload"/"storage" door.
    expect(primary?.items.map((item) => item.id)).toEqual([
      "files",
      "webpage",
      "google",
      "cloud_browser",
    ]);
    const allIds = categories.flatMap((c) => c.items.map((i) => i.id));
    expect(allIds).not.toContain("upload");
    expect(allIds).not.toContain("storage");
  });

  it("keeps primary rows headerless and groups MATRX items under Attach/Associate", () => {
    const categories = getVisibleResourcePickerCategories(undefined, {
      conversationId: "conv-1",
      // Force audio on so Voice Pad appears in the primary list.
    });
    const withAudio = getVisibleResourcePickerCategories(
      { supportsAudio: true },
      { conversationId: "conv-1" },
    );

    expect(withAudio[0]?.category).toBe("");
    expect(withAudio[0]?.items.map((i) => i.id)).toEqual([
      "files",
      "audio",
      "webpage",
      "google",
      "cloud_browser",
      "tools",
      "skills",
    ]);
    expect(
      categories.find((c) => c.category === "Attach/Associate"),
    ).toBeTruthy();
    expect(categories.some((c) => c.category === "Files")).toBe(false);
    expect(categories.some((c) => c.category === "MATRX")).toBe(false);
    expect(categories.some((c) => c.category === "This run")).toBe(false);
  });
});
