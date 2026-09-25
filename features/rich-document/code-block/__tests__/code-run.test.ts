/**
 * "Run" on a code block is present ONLY where the platform can really execute
 * it: the conversation is bound to a sandbox and the language has an
 * interpreter there. The code travels as stdin — never interpolated into the
 * shell command — so no quoting in the code can escape the command line.
 */

import { runCommandFor, runnableSandboxId } from "../code-run";

describe("runCommandFor", () => {
  it("maps runnable languages to a stdin interpreter", () => {
    expect(runCommandFor("python")).toBe("python3 -");
    expect(runCommandFor("py")).toBe("python3 -");
    expect(runCommandFor("javascript")).toBe("node -");
    expect(runCommandFor("js")).toBe("node -");
    expect(runCommandFor("bash")).toBe("bash -s");
    expect(runCommandFor("sh")).toBe("bash -s");
    expect(runCommandFor("shell")).toBe("bash -s");
  });
  it("is absent for languages with no interpreter path", () => {
    expect(runCommandFor("css")).toBeNull();
    expect(runCommandFor("json")).toBeNull();
    expect(runCommandFor(undefined)).toBeNull();
  });
});

describe("runnableSandboxId", () => {
  it("returns the bound orchestrator sandbox row id", () => {
    expect(runnableSandboxId({ rowId: "row-1", proxyUrl: "x", kind: "ec2" })).toBe("row-1");
    expect(runnableSandboxId({ rowId: "row-2", proxyUrl: "x" })).toBe("row-2");
  });
  it("is absent without a binding or for a local PC target", () => {
    expect(runnableSandboxId(null)).toBeNull();
    expect(runnableSandboxId({ rowId: "row-3", proxyUrl: "", kind: "local-pc" })).toBeNull();
  });
});
