/**
 * The Code column: the one format's TS reader, the GitHub range link, and the
 * super-admin-only gate (Arman, 2026-10-09: "the location is confidential and
 * should only be able to be seen by a superadmin").
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/supabase/authRetry", () => ({ runWithSessionRetry: jest.fn() }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  entriesFromPayload,
  githubRangeUrl,
  lineRangeText,
  parseCodeLocation,
} from "../codeLocation";

describe("parseCodeLocation — the TS twin of aidream code_location.CODE_LOCATION_RE", () => {
  it("reads repo, file and the line range", () => {
    expect(parseCodeLocation("aidream:aidream/services/x/mandates.py:120-138")).toEqual({
      repo: "aidream",
      filePath: "aidream/services/x/mandates.py",
      lineStart: 120,
      lineEnd: 138,
    });
  });
  it("reads a single line while the range is unmeasured", () => {
    expect(parseCodeLocation("matrx-frontend:features/a/b.ts:7")?.lineEnd).toBeNull();
  });
  it.each([
    "aidream.services.commerce_intake.mandates",
    "aidream:a.py",
    "aidream:a.py:0-3",
    "aidream:a.py:9-3",
    "",
  ])("refuses %s", (text) => {
    expect(parseCodeLocation(text)).toBeNull();
  });
});

describe("the GitHub link", () => {
  it("points at the line range on main", () => {
    const location = parseCodeLocation("aidream:aidream/services/x/mandates.py:120-138")!;
    expect(lineRangeText(location)).toBe("120-138");
    expect(githubRangeUrl("AI-Matrix-Engine/aidream", location)).toBe(
      "https://github.com/AI-Matrix-Engine/aidream/blob/main/aidream/services/x/mandates.py#L120-L138",
    );
  });
  it("is absent without a remote", () => {
    expect(githubRangeUrl(null, parseCodeLocation("a:b.py:1-2")!)).toBeNull();
  });
});

describe("entriesFromPayload", () => {
  it("keeps an app-created mandate with no location and parses the rest", () => {
    const byKey = entriesFromPayload([
      { mandate_key: "seo.cluster", origin: "code", is_enabled: true, code_path: "aidream:a.py:1-4", github_full_name: "o/r" },
      { mandate_key: "app.mine", origin: "user", is_enabled: true, code_path: null, github_full_name: null },
    ]);
    expect(byKey.get("seo.cluster")?.location?.lineEnd).toBe(4);
    expect(byKey.get("app.mine")?.location).toBeNull();
  });
  it("throws on a non-list answer instead of rendering an empty, honest-looking column", () => {
    expect(() => entriesFromPayload({ error: "x" })).toThrow();
  });
});

describe("super admins only", () => {
  it("the admin list adds the Code column only behind selectIsSuperAdmin", () => {
    const page = readFileSync(
      join(__dirname, "../../admin-list/MandateAdminListPage.tsx"),
      "utf8",
    );
    expect(page).toMatch(/const isSuperAdmin = useAppSelector\(selectIsSuperAdmin\)/);
    expect(page).toMatch(/isSuperAdmin\s*\?\s*\{\s*columns: withCodeLocationColumn\(/);
    const columns = readFileSync(join(__dirname, "../../admin-list/columns.tsx"), "utf8");
    expect(columns).not.toMatch(/codeLocation/);
  });
});
