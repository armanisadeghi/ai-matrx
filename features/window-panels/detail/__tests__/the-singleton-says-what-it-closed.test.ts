// 🚨 D8 — OPENING A SECOND RECORD NEVER SILENTLY CLOSES THE FIRST.
//
// Reproduced at VERIFY-U-P1 (break attempt 1): a deep link naming two records
// (`?panels=detail:file.B:as-window,detail:file.C:as-window`) opened C, dropped
// B, and rewrote the URL to hold C alone. The singleton is deliberate — it is
// the Notion peek — but nothing on screen said a record had been closed, while
// the app's window tray otherwise holds many windows at once.
//
// The rule now: the replacement is announced, by name, with an Undo.

import { recordToast } from "@/lib/toast";

import { announceSingletonReplacement } from "../singletonReplacement";

jest.mock("@/lib/toast", () => ({
  recordToast: { info: jest.fn() },
}));

const info = recordToast.info as unknown as jest.Mock;

const B = {
  type: "file",
  id: "bbbbbbbb-0000-0000-0000-000000000000",
  seedName: "Signed contract.pdf",
  seedAbout: null,
  listItems: null,
  listIndex: null,
};

const C = { type: "file", id: "cccccccc-0000-0000-0000-000000000000", seed: null, list: null };

beforeEach(() => {
  info.mockClear();
});

describe("the detail singleton", () => {
  it("names the record it closed and offers to put it back", () => {
    const reopen = jest.fn();
    const replaced = announceSingletonReplacement({
      previousData: B,
      previousWasOpen: true,
      next: C,
      surface: "window",
      reopen,
    });

    expect(replaced).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
    const [ref, message, options] = info.mock.calls[0];
    expect(ref).toEqual({ type: "file", id: B.id, title: "Signed contract.pdf" });
    expect(message).toContain("Signed contract.pdf");
    expect(message).toContain("window");
    expect(options.action.label).toBe("Reopen it");

    // The Undo actually reopens the record that was closed.
    options.action.onClick();
    expect(reopen).toHaveBeenCalledWith(
      expect.objectContaining({ type: "file", id: B.id }),
    );
  });

  it("names a record that has no name yet, rather than saying nothing", () => {
    announceSingletonReplacement({
      previousData: { ...B, seedName: null },
      previousWasOpen: true,
      next: C,
      surface: "docked panel",
      reopen: jest.fn(),
    });
    const [, message] = info.mock.calls[0];
    expect(message).toContain("file bbbbbbbb");
  });

  it("says nothing when the same record is reopened", () => {
    const replaced = announceSingletonReplacement({
      previousData: B,
      previousWasOpen: true,
      next: { type: B.type, id: B.id, seed: null, list: null },
      surface: "window",
      reopen: jest.fn(),
    });
    expect(replaced).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it("says nothing when nothing was open", () => {
    const replaced = announceSingletonReplacement({
      previousData: B,
      previousWasOpen: false,
      next: C,
      surface: "window",
      reopen: jest.fn(),
    });
    expect(replaced).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });
});
