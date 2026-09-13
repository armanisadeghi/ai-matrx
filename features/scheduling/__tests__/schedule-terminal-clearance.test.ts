import fs from "node:fs";
import path from "node:path";

const schedulesRoute = path.join(process.cwd(), "app/(core)/schedules");

function pageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(target);
    return entry.name === "page.tsx" ? [target] : [];
  });
}

describe("schedule route terminal clearance", () => {
  it("reserves mobile and desktop space above the fixed schedule alarm in every route scroller", () => {
    const routePages = pageFiles(schedulesRoute);

    expect(routePages).toHaveLength(4);
    for (const file of routePages) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).toContain("h-full overflow-y-auto");
      expect(source).toContain("pb-20 sm:pb-16");
    }
  });
});
