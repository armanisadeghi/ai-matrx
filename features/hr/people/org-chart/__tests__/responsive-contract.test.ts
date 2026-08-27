import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "features/hr/people/org-chart/HrOrgChart.tsx"),
  "utf8",
);

describe("HR org chart responsive interaction contract", () => {
  it("keeps the dotted-line switch at a 44px target below desktop", () => {
    expect(source).toContain(
      'aria-label="Show dotted-line reporting"\n                className="relative h-11 w-11',
    );
  });

  it("keeps every chart-card person door at a 44px target below desktop", () => {
    expect(source).toContain(
      'className="flex min-h-11 min-w-0 flex-1 flex-col justify-center',
    );
  });
});
