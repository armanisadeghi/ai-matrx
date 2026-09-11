import {
  ancestorPathsForFile,
  isCurrentFilesystemTab,
  isPathWithinRoot,
  validateFilesystemEntryName,
} from "./fileTreePaths";

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

  it("only reveals files owned by the current adapter", () => {
    expect(
      isCurrentFilesystemTab(
        { id: "sandbox:old:/tmp/report.md", path: "/tmp/report.md" },
        "sandbox:current",
      ),
    ).toBe(false);
    expect(
      isCurrentFilesystemTab(
        {
          id: "session-report:current",
          path: "/home/agent/.matrx/session-report.md",
        },
        "sandbox:current",
      ),
    ).toBe(true);
  });

  it("refuses nested paths and existing-name sentinels as entry names", () => {
    expect(validateFilesystemEntryName("src/new.ts")).toBeTruthy();
    expect(validateFilesystemEntryName("..")).toBeTruthy();
    expect(validateFilesystemEntryName("new.ts")).toBeNull();
  });
});
