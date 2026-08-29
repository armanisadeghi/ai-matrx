import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = (name: string) =>
  readFileSync(join(__dirname, name), "utf8");

describe("notes draft recovery hydration boundary", () => {
  it("hydrates the open-note recovery banner through the external store", () => {
    const source = componentSource("NoteDraftRecoveryBanner.tsx");

    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain('draftsVersion < 0 || fetchStatus !== "full"');
    expect(source).toContain("() => -1");
    expect(source).not.toContain("setDraft(");
  });

  it("hydrates the surface recovery list through the external store", () => {
    const source = componentSource("NotesDraftRecoveryList.tsx");

    expect(source).toContain("useSyncExternalStore(");
    expect(source).toContain("draftsVersion < 0");
    expect(source).toContain("() => -1");
    expect(source).not.toContain("setDrafts(");
  });
});
