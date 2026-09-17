// 🚨 D8, ROUND 2 — THE DEEP LINK IS THE PATH THE DEFECT WAS FOUND ON.
//
// Round 1 wired `announceSingletonReplacement` into the two opener HOOKS, and
// VERIFY-U-P1-R2 reproduced the original silence on the path D8 was found on:
// `?panels=detail:file.B:as-window,detail:file.C:as-window`. `UrlPanelManager`
// calls one hydrator per comma-separated token, and the `detail` hydrator
// dispatched `openOverlay` itself — so the second record replaced the first with
// `recordToast.info` called ZERO times.
//
// The announcement now lives in the ONE place the singleton is replaced
// (`openDetailSingleton`), which every opener and the hydrator go through. This
// suite drives the REGISTERED hydrator, not the openers, twice in a row.

import { configureStore } from "@reduxjs/toolkit";

import { recordToast } from "@/lib/toast";
import overlays, { selectOverlay } from "@/lib/redux/slices/overlaySlice";
import { getHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";
import { initUrlHydration } from "@/features/window-panels/url-sync/initUrlHydration";

jest.mock("@/lib/toast", () => ({
  recordToast: { info: jest.fn() },
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const info = recordToast.info as unknown as jest.Mock;

const B = "bbbbbbbb-0000-0000-0000-000000000000";
const C = "cccccccc-0000-0000-0000-000000000000";

function seat() {
  const store = configureStore({ reducer: { overlays } });
  initUrlHydration();
  const hydrate = getHydrator("detail");
  if (!hydrate) throw new Error("the `detail` hydrator is not registered");
  return {
    store,
    open: (id: string, args: Record<string, string> = {}) =>
      hydrate(store.dispatch as never, id, args),
    windowState: () => selectOverlay(store.getState(), "detailWindow"),
    dockedState: () => selectOverlay(store.getState(), "detailDocked"),
  };
}

beforeEach(() => info.mockClear());

describe("a `?panels=` deep link naming two records", () => {
  it("announces the record the singleton closed, by name", () => {
    const s = seat();

    s.open(`file.${B}`);
    expect(info).not.toHaveBeenCalled();

    s.open(`file.${C}`);

    expect(info).toHaveBeenCalledTimes(1);
    const [ref, message] = info.mock.calls[0];
    expect(ref).toMatchObject({ type: "file", id: B });
    expect(message).toContain("file bbbbbbbb");
    // The singleton stays: the second record is the one showing.
    expect(s.windowState().isOpen).toBe(true);
    expect((s.windowState().data as { id: string }).id).toBe(C);
  });

  it("says nothing when the same record is hydrated twice", () => {
    const s = seat();
    s.open(`file.${B}`);
    s.open(`file.${B}`);
    expect(info).not.toHaveBeenCalled();
  });

  it("announces a replacement in the docked panel too", () => {
    const s = seat();
    s.open(`file.${B}`, { as: "docked" });
    s.open(`file.${C}`, { as: "docked" });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toContain("docked panel");
    expect((s.dockedState().data as { id: string }).id).toBe(C);
  });
});

// 🚨 THE CLASS, NOT THE INSTANCE. Two openers and one hydrator each reached
// `openOverlay("detailWindow" | "detailDocked")`, and the one that was written
// last (the hydrator) is the one that forgot the announcement. This census is
// why a fourth opener cannot repeat it: the two detail overlays are opened
// through `openDetailSingleton` and nowhere else.
describe("the detail singletons have exactly one opener", () => {
  it("names no other file that dispatches openOverlay for them", () => {
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const candidates = execFileSync(
      "git",
      ["grep", "--untracked", "-l", "-E", "detailWindow|detailDocked", "--", "*.ts", "*.tsx"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("__tests__"));
    // Line-based grep cannot see this: the call and the overlay id sit on
    // different lines in every real offender.
    const offenders = candidates.filter((file) =>
      /openOverlay\(\s*\{[^)]*?detail(Window|Docked)/s.test(readFileSync(file, "utf8")),
    );
    // Empty: `openDetailSingleton` itself names the overlay through a variable,
    // so a literal `openOverlay({ overlayId: "detailWindow" … })` anywhere is a
    // second opener that will forget the announcement.
    expect(offenders).toEqual([]);
  });
});
