import { getVisibleResourcePickerCategories } from "../resource-picker-menu-items";

describe("getVisibleResourcePickerCategories", () => {
  it("limits a reused picker to the resource kinds supported by its host", () => {
    const categories = getVisibleResourcePickerCategories(undefined, {
      allowedViewIds: ["storage", "upload", "notes"],
    });

    expect(
      categories.flatMap((category) => category.items.map((item) => item.id)),
    ).toEqual(["storage", "notes", "upload"]);
    expect(categories.map((category) => category.category)).toEqual([
      "MATRX",
      "From the web",
    ]);
  });
});
