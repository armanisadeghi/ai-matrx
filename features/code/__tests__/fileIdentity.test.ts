/**
 * fileIdentity round-trip tests.
 *
 * For every adapter shape we ship, `tabToFileIdentity` →
 * `fileIdentityToTabId` must reproduce the original tab id (or a
 * functional equivalent that the workspace would re-create on open).
 */

import {
  fileIdentityEquals,
  fileIdentityKey,
  fileIdentityToTabId,
  tabToFileIdentity,
} from "../utils/fileIdentity";
import type { EditorFile } from "../types";

function makeTab(id: string, path: string): EditorFile {
  return {
    id,
    path,
    name: path.split("/").pop() ?? path,
    language: "typescript",
    content: "",
    pristineContent: "",
  };
}

describe("fileIdentity", () => {
  describe("round-trip via tabToFileIdentity / fileIdentityToTabId", () => {
    it("library tabs reproduce their id", () => {
      const tab = makeTab("library:abc-123", "library:/foo.ts");
      const identity = tabToFileIdentity(tab);
      expect(identity).toEqual({
        adapter: "library",
        path: "library:/foo.ts",
        libraryFileId: "abc-123",
      });
      expect(fileIdentityToTabId(identity!)).toBe(tab.id);
    });

    it("cloud-file tabs reproduce their id", () => {
      const tab = makeTab("cloud-file:xyz-999", "cloud-file:/photo.png");
      const identity = tabToFileIdentity(tab)!;
      expect(identity.adapter).toBe("cloud-file");
      expect(identity.libraryFileId).toBe("xyz-999");
      expect(fileIdentityToTabId(identity)).toBe(tab.id);
    });

    it("aga-app / prompt-app tabs reproduce their id", () => {
      const aga = tabToFileIdentity(
        makeTab("aga-app:row-1", "aga-app:/Applet"),
      )!;
      expect(aga.adapter).toBe("aga-app");
      expect(fileIdentityToTabId(aga)).toBe("aga-app:row-1");
      const prompt = tabToFileIdentity(
        makeTab("prompt-app:row-2", "prompt-app:/Prompt App"),
      )!;
      expect(prompt.adapter).toBe("prompt-app");
      expect(fileIdentityToTabId(prompt)).toBe("prompt-app:row-2");
    });

    it("tool-ui composite ids round-trip", () => {
      const tab = makeTab("tool-ui:row-1:render_fn", "tool-ui:/tool/render_fn");
      const id = tabToFileIdentity(tab)!;
      expect(id.adapter).toBe("tool-ui");
      expect(id.libraryFileId).toBe("row-1:render_fn");
      expect(fileIdentityToTabId(id)).toBe(tab.id);
    });

    it("filesystem adapters (sandbox / mock / cloud-fs) reproduce their id", () => {
      for (const adapter of ["sandbox", "mock", "cloud-fs"]) {
        const tab = makeTab(
          `${adapter}:/home/user/foo.ts`,
          "/home/user/foo.ts",
        );
        const identity = tabToFileIdentity(tab)!;
        expect(identity.adapter).toBe(adapter);
        expect(identity.path).toBe("/home/user/foo.ts");
        expect(fileIdentityToTabId(identity)).toBe(tab.id);
      }
    });

    it("returns null for tabs missing path or id", () => {
      const noPath = makeTab("library:foo", "");
      expect(tabToFileIdentity(noPath)).toBeNull();
      const noId = makeTab("", "/foo.ts");
      expect(tabToFileIdentity(noId)).toBeNull();
    });
  });

  describe("fileIdentityKey", () => {
    it("matches across two tabs that point to the same file", () => {
      const a = tabToFileIdentity(makeTab("sandbox:/proj/a.ts", "/proj/a.ts"))!;
      const b = tabToFileIdentity(makeTab("sandbox:/proj/a.ts", "/proj/a.ts"))!;
      expect(fileIdentityKey(a)).toBe(fileIdentityKey(b));
      expect(fileIdentityEquals(a, b)).toBe(true);
    });

    it("does not collapse the same path under two different adapters", () => {
      const sandbox = tabToFileIdentity(
        makeTab("sandbox:/proj/a.ts", "/proj/a.ts"),
      )!;
      const mock = tabToFileIdentity(makeTab("mock:/proj/a.ts", "/proj/a.ts"))!;
      expect(fileIdentityKey(sandbox)).not.toBe(fileIdentityKey(mock));
    });

    it("ignores libraryFileId for the canonical key", () => {
      // (adapter, path) is the identity; libraryFileId is just a
      // secondary handle for the library/cloud-file adapters.
      const a = tabToFileIdentity(makeTab("library:abc", "library:/foo.ts"))!;
      const b = { ...a, libraryFileId: undefined };
      expect(fileIdentityKey(a)).toBe(fileIdentityKey(b));
    });
  });
});
