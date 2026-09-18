/**
 * A window nobody opened may only open itself where it lives.
 *
 * THE DEFECT (D11, 2026-09-17, found on `/exports`). The "Spend so far today"
 * window raised ITSELF on whatever route a super admin happened to open the app
 * on — including the Bring-your-export page, whose whole job is a drop zone.
 * Parking it in the right gutter fixed WHERE it landed. This guard holds the
 * other half: that it is not there at all.
 *
 * It is held in the PRIMITIVE, not in spend and not with an `/exports`
 * blocklist: every automatic raiser asks `mayRaiseUnbidden`, and the answer
 * comes from the window's own `unbiddenHome` in the registry.
 *
 * The four things that must stay true:
 *   (a) a raise on `/exports` is refused;
 *   (b) a raise on the window's declared home is allowed;
 *   (c) a window that declared NO home is refused everywhere, and says so out
 *       loud — a raiser that silently never fires looks exactly like a broken
 *       one;
 *   (d) a refused raise does NOT spend the viewer's once-a-day: deferring is
 *       not discarding, so the localStorage "shown today" record is untouched
 *       and the window still appears on their next visit to a home route.
 *
 * Everything below runs the REAL primitive against the REAL registry, and (d)
 * runs the REAL mount against the REAL localStorage bookkeeping.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { mayRaiseUnbidden } from "../utils/mayRaiseUnbidden";
import { getStaticEntryByOverlayId } from "../registry/windowRegistryMetadata";
import {
  localDay,
  readState,
} from "@/features/admin/spend/dailySpendPopoverState";

// ── The mount's surroundings, and only its surroundings ──────────────────────
// Real: mayRaiseUnbidden, the window registry, dailySpendPopoverState,
// localStorage. Mocked: who is signed in, the cadence knob, the route, and the
// redux dispatch — none of which this defect is about.

let currentPathname = "/exports";
jest.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const dispatched: unknown[] = [];
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => true, // a super admin
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action);
    return action;
  },
}));

jest.mock("@/features/admin/spend/useSpendPopoverKnobs", () => ({
  useSpendPopoverKnobs: () => ({
    knobs: { timesPerDay: 1 },
    loading: false,
    error: null,
  }),
}));

// Imported AFTER the mocks so the mount picks them up.
const { DailySpendPopoverMount } =
  require("@/features/admin/spend/DailySpendPopoverMount") as typeof import("@/features/admin/spend/DailySpendPopoverMount");

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SPEND = "dailySpendWindow";

describe("mayRaiseUnbidden — the window registry decides where a window may open itself", () => {
  let warn: jest.SpyInstance;
  let info: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    info = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    info.mockRestore();
  });

  it("(a) refuses the daily spend window on /exports — the page is a drop zone, not its home", () => {
    const verdict = mayRaiseUnbidden(SPEND, "/exports");

    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("away-from-home");
    // Not silent about it.
    expect(verdict.reason).toContain("/exports");
    expect(info).toHaveBeenCalled();
  });

  it("(a2) refuses it on every other route that is not its home", () => {
    for (const route of ["/chat", "/masterwork", "/exports/new", "/"]) {
      expect(mayRaiseUnbidden(SPEND, route).allowed).toBe(false);
    }
  });

  it("(b) allows it on its declared home, and on pages nested under it", () => {
    for (const route of [
      "/dashboard",
      "/administration",
      "/administration/spend",
    ]) {
      const verdict = mayRaiseUnbidden(SPEND, route);
      expect({ route, allowed: verdict.allowed }).toEqual({
        route,
        allowed: true,
      });
    }
  });

  it("(b2) does not mistake a route that merely starts with the same letters for home", () => {
    expect(mayRaiseUnbidden(SPEND, "/administration-archive").allowed).toBe(
      false,
    );
  });

  it("(c) refuses a window that declared no home — anywhere — and warns naming it", () => {
    // A real registry entry with no `unbiddenHome`, so this cannot rot into a
    // test about a fixture.
    const undeclared = "structuredValueWindow";
    expect(getStaticEntryByOverlayId(undeclared)?.unbiddenHome).toBeUndefined();

    const verdict = mayRaiseUnbidden(undeclared, "/dashboard");

    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("no-declared-home");
    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(message).toContain(undeclared);
    expect(message).toContain("unbiddenHome");
  });

  it("(c2) refuses an overlay the registry has never heard of, and warns", () => {
    const verdict = mayRaiseUnbidden("someWindowNobodyRegistered", "/dashboard");
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe("no-declared-home");
    expect(
      warn.mock.calls.some((c) =>
        String(c[0]).includes("someWindowNobodyRegistered"),
      ),
    ).toBe(true);
  });
});

describe("(d) a refused raise costs the viewer nothing — deferring is not discarding", () => {
  let container: HTMLDivElement;
  let root: Root;
  let warn: jest.SpyInstance;
  let info: jest.SpyInstance;

  beforeEach(() => {
    window.localStorage.clear();
    dispatched.length = 0;
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    info = jest.spyOn(console, "info").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    warn.mockRestore();
    info.mockRestore();
  });

  it("does not open on /exports, and does not mark itself shown for today", async () => {
    currentPathname = "/exports";

    await act(async () => {
      root.render(<DailySpendPopoverMount />);
    });

    expect(dispatched).toHaveLength(0);
    // THE HALF THAT MAKES IT A DEFERRAL: the day's record is untouched.
    expect(readState(localDay()).shown).toBe(0);
    expect(window.localStorage.getItem("matrx.spend_popover.v1")).toBeNull();
  });

  it("still raises on the next visit to a home route, the same day", async () => {
    currentPathname = "/exports";
    await act(async () => {
      root.render(<DailySpendPopoverMount />);
    });
    expect(dispatched).toHaveLength(0);

    // The viewer navigates to the dashboard — same mount, same day.
    currentPathname = "/dashboard";
    await act(async () => {
      root.render(<DailySpendPopoverMount />);
    });

    expect(dispatched).toHaveLength(1);
    expect(readState(localDay()).shown).toBe(1);
  });

  it("opens straight away when the app is opened on a home route", async () => {
    currentPathname = "/administration/spend";

    await act(async () => {
      root.render(<DailySpendPopoverMount />);
    });

    expect(dispatched).toHaveLength(1);
    expect(readState(localDay()).shown).toBe(1);
  });
});
