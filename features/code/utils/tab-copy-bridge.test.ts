import type { FilesystemAdapter } from "../adapters/FilesystemAdapter";
import "../library-sources/registerBuiltinLibrarySources";
import {
  getTabCopyDestination,
  isMissingSandboxPathError,
  normalizeSandboxCopyPath,
  tabOriginLabel,
} from "./tab-copy-bridge";

const sandbox = {
  id: "sandbox:row-1",
  label: "Build sandbox",
  writable: true,
  writeFile: async () => undefined,
  stat: async () => ({ path: "/x", kind: "file" as const, size: 1 }),
} satisfies Pick<
  FilesystemAdapter,
  "id" | "label" | "writable" | "writeFile" | "stat"
>;

describe("tab copy bridge", () => {
  it("only offers Library/source copies to a writable, stat-capable sandbox", () => {
    expect(
      getTabCopyDestination(
        { id: "library:one", path: "library:/one.ts" },
        sandbox,
      ),
    ).toBe("sandbox");
    expect(
      getTabCopyDestination(
        { id: "aga-app:one", path: "aga-app:/one.tsx" },
        sandbox,
      ),
    ).toBe("sandbox");
    expect(
      getTabCopyDestination(
        { id: "library:one", path: "library:/one.ts" },
        { ...sandbox, id: "mock" },
      ),
    ).toBeNull();
    expect(
      getTabCopyDestination(
        { id: "library:one", path: "library:/one.ts" },
        { ...sandbox, stat: undefined },
      ),
    ).toBeNull();
  });

  it("offers sandbox filesystem tabs a Library copy without changing their source", () => {
    expect(
      getTabCopyDestination(
        { id: "sandbox:row-1:/home/agent/a.ts", path: "/home/agent/a.ts" },
        sandbox,
      ),
    ).toBe("library");
    expect(
      getTabCopyDestination(
        { id: "sandbox:other:/home/agent/a.ts", path: "/home/agent/a.ts" },
        sandbox,
      ),
    ).toBeNull();
  });

  it("accepts only canonical absolute sandbox targets", () => {
    expect(normalizeSandboxCopyPath(" /home/agent/src//copy.ts ")).toBe(
      "/home/agent/src/copy.ts",
    );
    expect(normalizeSandboxCopyPath("relative.ts")).toBeNull();
    expect(normalizeSandboxCopyPath("/home/agent/../secret.ts")).toBeNull();
  });

  it("labels save origins and recognizes the adapter missing-path response", () => {
    expect(
      tabOriginLabel({ id: "library:one", path: "library:/one.ts" }, sandbox),
    ).toBe("Library");
    expect(
      tabOriginLabel(
        { id: "tool-ui:one:inline", path: "tool-ui:/one/inline.ts" },
        sandbox,
      ),
    ).toBe("Tool UIs");
    expect(
      tabOriginLabel(
        { id: "sandbox:row-1:/home/agent/a.ts", path: "/home/agent/a.ts" },
        sandbox,
      ),
    ).toBe("Sandbox: Build sandbox");
    expect(
      isMissingSandboxPathError(new Error("fs GET stat failed (404): missing")),
    ).toBe(true);
  });
});
