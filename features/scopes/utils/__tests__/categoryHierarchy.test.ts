import { buildCategoryHierarchy } from "@/features/scopes/utils/categoryHierarchy";
import type { PlatformCategory } from "@/features/scopes/types";

function category(
  id: string,
  name: string,
  parentId: string | null = null,
): PlatformCategory {
  return {
    id,
    orgId: "00000000-0000-0000-0000-000000000001",
    dimension: "test",
    name,
    slug: null,
    parentId,
    isSystem: false,
    color: null,
    icon: null,
    position: null,
    metadata: null,
  };
}

describe("buildCategoryHierarchy", () => {
  it("preserves flat facets exactly", () => {
    const input = [category("b", "Beta"), category("a", "Alpha")];

    const result = buildCategoryHierarchy(input);

    expect(result.hasHierarchy).toBe(false);
    expect(result.items.map((item) => item.category)).toEqual(input);
    expect(result.items.map((item) => item.displayName)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });

  it("places every child directly after its parent", () => {
    const input = [
      category("news", "News & media"),
      category("company", "Company"),
      category("regional", "Regional newspaper", "news"),
      category("saas", "SaaS company", "company"),
      category("magazine", "Magazine", "news"),
    ];

    const result = buildCategoryHierarchy(input);

    expect(result.hasHierarchy).toBe(true);
    expect(result.items.map((item) => item.category.id)).toEqual([
      "news",
      "regional",
      "magazine",
      "company",
      "saas",
    ]);
    expect(result.items.map((item) => item.depth)).toEqual([0, 1, 1, 0, 1]);
    expect(result.items[1]?.displayName).toBe(
      "News & media / Regional newspaper",
    );
  });

  it("keeps an orphaned row visible", () => {
    const orphan = category("orphan", "Still visible", "missing");

    const result = buildCategoryHierarchy([
      category("root", "Root"),
      category("child", "Child", "root"),
      orphan,
    ]);

    expect(result.items.at(-1)?.category).toBe(orphan);
    expect(result.items.at(-1)?.depth).toBe(0);
  });
});
