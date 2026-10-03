/**
 * @jest-environment jsdom
 *
 * The Error Inspector survives a reload of the tab.
 *
 * Live incident 2026-10-01 (PB-01 run 2, S14): every error captured during a
 * run was gone the moment the page reloaded — the store lived only in module
 * memory, so the evidence was lost before anyone read it. Captures now ride
 * the tab's sessionStorage, bounded, and come back on the next page load.
 *
 * Each "page" below is a fresh module registry (`jest.isolateModules`) over
 * the SAME jsdom sessionStorage — exactly what a reload is to this store.
 */

type Store = typeof import("./errorCaptureStore");

function loadPage(): Store {
  let mod!: Store;
  jest.isolateModules(() => {
    mod = jest.requireActual("./errorCaptureStore") as Store;
  });
  return mod;
}

function leavePage(): void {
  window.dispatchEvent(new Event("pagehide"));
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Error Inspector entries survive a reload", () => {
  it("a capture on one page is in the inspector on the next", () => {
    const first = loadPage();
    first.captureError({
      source: "supabase-postgrest",
      operation: "select",
      relation: "chat.tool_call",
      code: "42501",
      message: "permission denied for table tool_call",
    });
    leavePage();

    const second = loadPage();
    const restored = second.getSnapshot();
    expect(restored).toHaveLength(1);
    expect(restored[0].message).toBe("permission denied for table tool_call");
    expect(restored[0].relation).toBe("chat.tool_call");
    expect(restored[0].restoredFromPreviousPage).toBe(true);
    // Still unseen: the badge keeps telling the truth across the reload.
    expect(second.getStatsSnapshot().unseenRed).toBeGreaterThan(0);
  });

  it("a recurrence after the reload collapses into the restored row and counts on", () => {
    const first = loadPage();
    first.captureError({ source: "supabase-postgrest", message: "boom" });
    leavePage();
    const second = loadPage();
    second.captureError({ source: "supabase-postgrest", message: "boom" });
    const [row] = second.getSnapshot();
    expect(row.count).toBe(2);
    // A new occurrence on THIS page is fresh evidence, not a replay.
    expect(row.restoredFromPreviousPage).toBeUndefined();
  });

  it("is bounded: newest entries kept, oversized raw payloads trimmed", () => {
    const first = loadPage();
    for (let i = 0; i < 250; i++) {
      first.captureError({
        source: "supabase-postgrest",
        message: `error ${i}`,
        raw: { blob: "x".repeat(20_000) },
      });
    }
    leavePage();
    const stored = window.sessionStorage.getItem("matrx:error-inspector:v1");
    expect(stored).not.toBeNull();
    expect(stored!.length).toBeLessThan(1_100_000);

    const second = loadPage();
    const restored = second.getSnapshot();
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.length).toBeLessThanOrEqual(100);
    expect(restored[0].message).toBe("error 249");
  });

  it("clearing the inspector clears what the next page restores", () => {
    const first = loadPage();
    first.captureError({ source: "supabase-postgrest", message: "gone" });
    first.clearCapturedErrors();
    leavePage();
    expect(loadPage().getSnapshot()).toHaveLength(0);
  });

  it("a broken or blocked storage never breaks capture", () => {
    window.sessionStorage.setItem("matrx:error-inspector:v1", "{not json");
    const page = loadPage();
    expect(page.getSnapshot()).toHaveLength(0);
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      expect(() => {
        page.captureError({ source: "supabase-postgrest", message: "still captured" });
        leavePage();
      }).not.toThrow();
      expect(page.getSnapshot()[0].message).toBe("still captured");
    } finally {
      spy.mockRestore();
    }
  });

  it("a row last seen on an earlier deployment is not restored on a newer one", () => {
    const saved = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
    try {
      process.env.NEXT_PUBLIC_DEPLOYMENT_ID = "dpl_old";
      const oldBuild = loadPage();
      oldBuild.captureError({ source: "supabase-postgrest", code: "PGRST202", message: "fixed since" });
      leavePage();

      process.env.NEXT_PUBLIC_DEPLOYMENT_ID = "dpl_new";
      const newBuild = loadPage();
      expect(newBuild.getSnapshot()).toHaveLength(0);
      newBuild.captureError({ source: "supabase-postgrest", message: "still broken" });
      leavePage();

      const sameBuild = loadPage();
      expect(sameBuild.getSnapshot().map((e) => e.message)).toEqual(["still broken"]);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
      else process.env.NEXT_PUBLIC_DEPLOYMENT_ID = saved;
    }
  });
});
