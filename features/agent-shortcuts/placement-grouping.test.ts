// The guard for the GlobalError that FIX-6 made reachable.
//
// `platform.categories.placement_type` is NULLABLE, and production has exactly
// one global shortcut category with no placement (`Saved requests`, in the
// system org). While global categories were invisible, nothing ever sorted it.
// The moment they rendered, every surface that grouped categories by placement
// used the raw value as a Map key and then sorted those keys with
// `a.localeCompare(b)` — so ONE row took the whole admin Categories page down:
//
//   [GlobalError] TypeError: Cannot read properties of null (reading 'localeCompare')
//     at Array.sort (<anonymous>)
//
// The rule is `placementGroupKey`: never key or sort by the raw value. An
// unplaced category is SHOWN and NAMED, never dropped and never fatal.

import {
  getPlacementTypeMeta,
  placementGroupKey,
  UNPLACED_PLACEMENT_KEY,
} from "@/features/agent-shortcuts/constants";

type Cat = { id: string; placementType: string | null };

// What every consumer does: bucket by placement, then sort the bucket keys.
function groupAndSort(categories: Cat[]): string[] {
  const byPlacement = new Map<string, Cat[]>();
  for (const c of categories) {
    const key = placementGroupKey(c.placementType);
    if (!byPlacement.has(key)) byPlacement.set(key, []);
    byPlacement.get(key)!.push(c);
  }
  return Array.from(byPlacement.keys()).sort((a, b) => a.localeCompare(b));
}

// The live shape: 6 placements plus the one unplaced row.
const productionShape: Cat[] = [
  { id: "text-ops", placementType: "ai-action" },
  { id: "block-components", placementType: "content-block" },
  { id: "code-learning", placementType: "user-tool" },
  { id: "prompt-enhancers", placementType: "button" },
  { id: "content-cards", placementType: "card" },
  { id: "quick-actions", placementType: "quick-action" },
  { id: "saved-requests", placementType: null }, // ← the row that crashed it
];

describe("categories with no placement type", () => {
  it("THE REGRESSION: sorting raw placement keys throws on the live null row", () => {
    // Pinned so the shape of the crash cannot come back unnoticed. This is the
    // exact expression the pre-fix code ran.
    const rawKeys = productionShape.map((c) => c.placementType);
    expect(() =>
      [...rawKeys].sort((a, b) => (a as string).localeCompare(b as string)),
    ).toThrow(/localeCompare/);
  });

  it("groups and sorts the whole production shape without throwing", () => {
    expect(() => groupAndSort(productionShape)).not.toThrow();
    expect(groupAndSort(productionShape)).toHaveLength(7);
  });

  it("keeps the unplaced row — it is shown, not dropped", () => {
    expect(groupAndSort(productionShape)).toContain(UNPLACED_PLACEMENT_KEY);
  });

  it("names the bucket honestly and says what to do about it", () => {
    const meta = getPlacementTypeMeta(null);
    expect(meta.label).toBe("No placement");
    expect(meta.description).toMatch(/nothing in them is offered anywhere/i);
    expect(meta.description).toMatch(/give it one/i);
    // The same answer whether the caller passes null or the bucket key.
    expect(getPlacementTypeMeta(UNPLACED_PLACEMENT_KEY)).toEqual(meta);
    expect(getPlacementTypeMeta(undefined)).toEqual(meta);
    expect(getPlacementTypeMeta("")).toEqual(meta);
  });

  it("leaves a real placement type completely alone", () => {
    expect(placementGroupKey("ai-action")).toBe("ai-action");
    expect(getPlacementTypeMeta("ai-action").label).toBe("AI Actions");
  });
});
