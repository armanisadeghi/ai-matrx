/**
 * The pure halves of the code-references reader: what a bypass site "calls",
 * the GitHub line link, and the copyable location.
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/supabase/authRetry", () => ({ runWithSessionRetry: jest.fn() }));

import { githubLineUrl, locationText, parseCallTarget } from "../data";

describe("parseCallTarget", () => {
  it("reads an import and an API host", () => {
    expect(parseCallTarget("import anthropic")).toEqual({ calls: "anthropic", via: "Import" });
    expect(parseCallTarget("import openai.types.responses")).toEqual({ calls: "openai.types.responses", via: "Import" });
    expect(parseCallTarget("host api.x.ai")).toEqual({ calls: "api.x.ai", via: "API host" });
  });

  it("never invents a target the scanner did not record", () => {
    expect(parseCallTarget("<module>")).toEqual({ calls: "", via: "" });
    expect(parseCallTarget(null)).toEqual({ calls: "", via: "" });
  });
});

describe("githubLineUrl", () => {
  it("pins to the scanned commit and anchors the line", () => {
    expect(
      githubLineUrl("AI-Matrix-Engine/aidream", "1814438171f1c6657c7d1e5e38abaf32dd829278", "aidream/package_integration.py", 1742),
    ).toBe(
      "https://github.com/AI-Matrix-Engine/aidream/blob/1814438171f1c6657c7d1e5e38abaf32dd829278/aidream/package_integration.py#L1742",
    );
  });

  it("falls back to main for a non-commit revision and refuses without a repo or file", () => {
    expect(githubLineUrl("o/r", "working-tree", "a.ts", null)).toBe("https://github.com/o/r/blob/main/a.ts");
    expect(githubLineUrl(null, "abc1234", "a.ts", 1)).toBeNull();
    expect(githubLineUrl("o/r", "abc1234", null, 1)).toBeNull();
  });
});

describe("locationText", () => {
  it("is repo/file:line, degrading honestly", () => {
    expect(locationText({ repo_slug: "aidream", file_path: "x/y.py", line: 3 })).toBe("aidream/x/y.py:3");
    expect(locationText({ repo_slug: "aidream", file_path: null, line: null, symbol: "Foo" })).toBe("aidream: Foo");
    expect(locationText({ repo_slug: null, file_path: null, line: null })).toBe("Not recorded");
  });
});
