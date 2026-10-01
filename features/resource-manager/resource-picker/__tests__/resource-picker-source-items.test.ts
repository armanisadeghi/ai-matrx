import {
  RESOURCE_PICKER_SOURCE_ITEMS,
  flattenResourcePickerItems,
} from "../resource-picker-menu-items";
import { SOURCE_KINDS } from "@/features/resource-manager/source-input/sourceKinds";

describe("canonical association items", () => {
  it("source tiles draw their label, icon and tint from the canonical items", () => {
    for (const kind of SOURCE_KINDS) {
      const item = RESOURCE_PICKER_SOURCE_ITEMS[kind.id];
      expect({ label: kind.label, icon: kind.icon, tint: kind.iconClassName }).toEqual({
        label: item.label,
        icon: item.icon,
        tint: item.iconClassName,
      });
    }
  });

  it("a door that is also a menu row looks the same in both", () => {
    const rows = new Map(flattenResourcePickerItems().map((r) => [r.id, r]));
    const shared = [
      ["web", "webpage"],
      ["youtube", "youtube"],
      ["audio", "audio"],
      ["image", "image_url"],
    ] as const;
    for (const [tileId, rowId] of shared) {
      const tile = RESOURCE_PICKER_SOURCE_ITEMS[tileId];
      const row = rows.get(rowId)!;
      expect([tile.icon, tile.iconClassName]).toEqual([row.icon, row.iconClassName]);
    }
  });

  it("every source item has a tint", () => {
    for (const item of Object.values(RESOURCE_PICKER_SOURCE_ITEMS)) {
      expect(item.iconClassName).toMatch(/^text-/);
    }
  });
});
