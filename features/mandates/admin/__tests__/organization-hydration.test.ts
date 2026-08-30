import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../MandatesConsole.tsx"), "utf8");

describe("MandatesConsole organization hydration boundary", () => {
  it("waits for explicit organization context and refetches when it changes", () => {
    expect(source).toContain(
      'import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";',
    );
    expect(source).toContain(
      "const selectedOrganizationId = useAppSelector(selectOrganizationId);",
    );
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s+if \(!selectedOrganizationId\) return;\s+fetchData\(\);\s+\}, \[fetchData, selectedOrganizationId\]\);/,
    );
  });
});
