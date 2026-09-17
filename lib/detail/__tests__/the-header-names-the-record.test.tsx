// 🚨 D2, D4 and D5 — WHAT THE HEADER SHOWS, AND WHAT IT REFUSES TO INVENT.
//
// Three defects lived in one bar (VERIFY-U-P1, 2026-09-17):
//
//   D2  At 390px the page header showed icon + type chip + icons and NO record
//       name, with the id chip colliding with the shell's right-hand cluster.
//   D4  At the window's default 540px the type chip and the open-as icons were
//       drawn on top of each other — the collision the file's own comment said
//       it was compact to avoid. The cause was a `sm:`-revealed uuid in the
//       action cluster: `sm:` answers the VIEWPORT (1440), never the window.
//   D5  A failed load still rendered "Untitled File" + a type chip above its
//       own error, so a record that could not be read looked like a real,
//       unnamed one.
//
// jsdom has no layout, so none of these is asserted in pixels. What IS asserted
// is the composition that caused them: the name is always in the bar, the bar
// carries no id text at any viewport, the chip and the id are reachable in the
// body meta line instead, and a title with nothing behind it marks itself.

import * as React from "react";
import { act } from "react";

import { DetailActions, DetailRecordMeta, DetailTitle } from "../core/DetailHeader";
import { useDetailCore, type DetailCore } from "../core/useDetailCore";
import type { DetailLoadResult, DetailRecordType } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

const ID = instance().id;

function Bar() {
  const core = useDetailCore(
    instance({ seed: null }),
    "window",
    { onClose: () => {} },
  );
  return (
    <div>
      <div data-testid="title">
        <DetailTitle core={core} />
      </div>
      <div data-testid="actions">
        <DetailActions core={core} />
      </div>
      <div data-testid="meta">
        <DetailRecordMeta core={core} />
      </div>
    </div>
  );
}

function widthIs(px: number): void {
  Object.defineProperty(window, "innerWidth", { value: px, configurable: true });
}

function seatedCore(recordType: DetailRecordType) {
  return makePorts({ resolveType: () => recordType });
}

describe("the detail header", () => {
  for (const width of [540, 390]) {
    it(`names the record and carries no id text in the bar at ${width}px`, () => {
      widthIs(width);
      const named: DetailRecordType = {
        ...FILE_TYPE,
        load: async (): Promise<DetailLoadResult> => ({ row: { file_name: "Q3 plan.pdf" } }),
      };
      const m = mount(<Bar />, seatedCore(named));

      const title = m.container.querySelector("[data-detail-title]");
      expect(title).not.toBeNull();
      // The name (seed-less, pre-load it is the honest stand-in) is TEXT in the
      // bar — never hidden, never reduced to an icon.
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
      expect(title?.className).not.toContain("hidden");

      // D4: the action cluster is icons only. The uuid is what made it wide.
      const actions = m.container.querySelector("[data-detail-actions]");
      expect(actions?.textContent ?? "").not.toContain(ID);
      expect(actions?.querySelector("[data-detail-copy-id]")).not.toBeNull();

      // D2: chip and id are not lost — they are in the body meta line, and the
      // chip's own copy in the bar is the one that steps aside below `sm`.
      const meta = m.container.querySelector("[data-detail-record-meta]");
      expect(meta?.querySelector("[data-detail-id]")?.textContent).toBe(ID);
      expect(meta?.querySelector("[data-detail-type-chip]")?.className).toContain("sm:hidden");
      const barChip = m.container
        .querySelector("[data-testid='title']")
        ?.querySelector("[data-detail-type-chip]");
      expect(barChip?.className).toContain("hidden");
      expect(barChip?.className).toContain("sm:inline-block");

      m.unmount();
    });
  }

  it("invents no record when the load fails (D5)", async () => {
    const failing: DetailRecordType = {
      ...FILE_TYPE,
      load: async () => {
        throw new Error("Failed to fetch");
      },
    };
    const m = mount(<Bar />, seatedCore(failing));
    // Let the rejected load settle into the core's error state.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const title = m.container.querySelector("[data-detail-title]");
    const text = title?.textContent ?? "";
    expect(text).not.toContain("Untitled");
    expect(text.toLowerCase()).toContain("could not be loaded");
    expect(title?.getAttribute("data-detail-title-standin")).toBe("true");
    // No doors beside a title with no record behind it.
    expect(m.container.querySelector("[data-doors]")).toBeNull();
    m.unmount();
  });

  // 🚨 D5 / NEW-1 (VERIFY-U-P1-R2) — A TYPE WITH NO SOURCE IS THE ABSENT
  // STATE, NOT A LOADED RECORD. `load: null` resolved to `status: "none"`,
  // which round 1's fix treated as a successful load: the registration's
  // `title()` answered "Untitled File" in foreground weight, the record's doors
  // were hung beside it, and the body underneath said no details were
  // available. Every unregistered type takes that path.
  // 🚨 REVISED BY NEW-9 (VERIFY-U-P1-R3). Round 2's fix put the SENTENCE "No
  // detail is registered for file records" where the record's name goes and
  // dropped the doors, so a record that exists became a named dead end
  // (`features/item-presentation/registry.tsx` was printed at the person in the
  // body). The absent state is still marked a stand-in and still invents no
  // name — it is named from the type and the record's own id — and the doors
  // stay, because the record exists and opens elsewhere.
  it("names the record from its type and id, keeps the doors, invents nothing (NEW-9)", () => {
    const sourceless: DetailRecordType = { ...FILE_TYPE, load: null };
    const m = mount(<Bar />, seatedCore(sourceless));

    const title = m.container.querySelector("[data-detail-title]");
    const text = title?.textContent ?? "";
    expect(text).not.toContain("Untitled");
    expect(text).toContain("File");
    expect(text).toContain(ID.slice(0, 8));
    expect(text.toLowerCase()).not.toContain("registered");
    expect(title?.getAttribute("data-detail-title-standin")).toBe("true");
    expect(m.container.querySelector("[data-doors]")).not.toBeNull();
    m.unmount();
  });

  it("shows a seeded name rather than a stand-in while the record loads", () => {
    const slow: DetailRecordType = {
      ...FILE_TYPE,
      load: () => new Promise<DetailLoadResult>(() => {}),
    };
    function Seeded() {
      const core: DetailCore = useDetailCore(
        instance({ seed: { name: "Signed contract.pdf" } }),
        "window",
        { onClose: () => {} },
      );
      return <DetailTitle core={core} />;
    }
    const m = mount(<Seeded />, seatedCore(slow));
    const title = m.container.querySelector("[data-detail-title]");
    expect(title?.textContent).toContain("Signed contract.pdf");
    expect(title?.getAttribute("data-detail-title-standin")).toBeNull();
    m.unmount();
  });
});
