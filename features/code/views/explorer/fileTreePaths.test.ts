import { ancestorPathsForFile, isPathWithinRoot } from "./fileTreePaths";

describe("active file reveal paths", () => {
  it("opens every Session Report ancestor beneath the sandbox root", () => {
    expect(
      ancestorPathsForFile(
        "/home/agent/.matrx/session-report.md",
        "/home/agent",
      ),
    ).toEqual(["/home/agent", "/home/agent/.matrx"]);
  });

  it("does not treat a shared string prefix as a descendant", () => {
    expect(isPathWithinRoot("/home/agent-two/report.md", "/home/agent")).toBe(
      false,
    );
  });
});
