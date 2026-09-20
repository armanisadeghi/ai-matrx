import {
  adminNavigationRegistry,
  getAdminNavigationArchitectureErrors,
} from "./admin-navigation";

describe("admin navigation registry", () => {
  it("registers every destination link exactly once", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const domain of adminNavigationRegistry) {
      for (const section of domain.sections) {
        for (const item of section.destinations) {
          const here = `${domain.name} → ${section.name}`;
          const first = seen.get(item.link);
          if (first) {
            duplicates.push(`${item.link}: ${first} and ${here}`);
          } else {
            seen.set(item.link, here);
          }
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("reports no architecture errors", () => {
    expect(getAdminNavigationArchitectureErrors()).toEqual([]);
  });
});
