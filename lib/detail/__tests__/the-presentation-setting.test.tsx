// 🚨 THE PRESENTATION SETTING: PER RECORD TYPE, AND WRITABLE FROM THE RECORD.
//
// Two gaps against Arman's words (2026-09-17) and PLAN §5.1, both open at
// VERIFY-U-P1:
//
//   (c) "a per-record-type override" — `overridable_by` carried organization
//       and user only, and nothing in the client resolved a per-type value.
//       `presentationForTypeFromMap` is the reader; `ui.detail.presentation_by_type`
//       is the key (see migrations/detail_presentation_by_type_knob.sql for why
//       it is a second key and not the platform's `table` rung).
//
//   (b) "Cmd+Enter saves" — `registerSave` had ZERO callers in the repo, so the
//       chord saved nothing on any surface. `DetailPresentationPane` is the
//       caller: no record type on this branch has an editable body, so the
//       contract is held by the one editable thing a detail owns, its own
//       setting. It is also the ONLY surface that writes the knob.

import * as React from "react";
import { act } from "react";

import { DetailPresentationPane } from "../core/DetailPresentationPane";
import { useDetailCore } from "../core/useDetailCore";
import { presentationForTypeFromMap } from "../types";
import { clickByLabel, instance, makePorts, mount } from "./harness";

describe("presentationForTypeFromMap", () => {
  it("answers for the type it holds and nothing else", () => {
    const map = { file: "docked", task: "page" };
    expect(presentationForTypeFromMap(map, "file")).toBe("docked");
    expect(presentationForTypeFromMap(map, "task")).toBe("page");
    expect(presentationForTypeFromMap(map, "note")).toBeUndefined();
  });

  it("refuses anything that is not one of the three presentations", () => {
    expect(presentationForTypeFromMap({ file: "sidebar" }, "file")).toBeUndefined();
    expect(presentationForTypeFromMap({ file: 3 }, "file")).toBeUndefined();
  });

  it("treats a missing, empty or wrongly-shaped map as no override", () => {
    expect(presentationForTypeFromMap(undefined, "file")).toBeUndefined();
    expect(presentationForTypeFromMap(null, "file")).toBeUndefined();
    expect(presentationForTypeFromMap({}, "file")).toBeUndefined();
    expect(presentationForTypeFromMap(["docked"], "file")).toBeUndefined();
    expect(presentationForTypeFromMap("docked", "file")).toBeUndefined();
  });
});

function Pane() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return (
    <div {...core.keyboard.rootProps} data-root>
      <DetailPresentationPane core={core} />
    </div>
  );
}

function openThePane(container: HTMLElement): void {
  const collapsed = container.querySelector<HTMLElement>(
    "[data-detail-presentation-pane='collapsed']",
  );
  if (!collapsed) throw new Error("the collapsed presentation row is not rendered");
  act(() => collapsed.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function choose(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no "${label}" control in the pane`);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("the presentation pane", () => {
  it("writes the person's default through the host", async () => {
    const ports = makePorts();
    const m = mount(<Pane />, ports);
    openThePane(m.container);
    choose(m.container, "Docked");
    await act(async () => {
      choose(m.container, "Save");
    });
    expect(ports.savePresentation).toHaveBeenCalledWith({
      presentation: "docked",
      forType: null,
    });
    m.unmount();
  });

  it("writes the PER-RECORD-TYPE override when asked to", async () => {
    const ports = makePorts();
    const m = mount(<Pane />, ports);
    openThePane(m.container);
    choose(m.container, "Page");
    const onlyThisType = m.container.querySelector("input[type='checkbox']") as HTMLInputElement;
    act(() => onlyThisType.click());
    await act(async () => {
      choose(m.container, "Save");
    });
    expect(ports.savePresentation).toHaveBeenCalledWith({
      presentation: "page",
      forType: "file",
    });
    m.unmount();
  });

  it("saves on Cmd+Enter — the chord's first and only caller", async () => {
    const ports = makePorts();
    const m = mount(<Pane />, ports);
    openThePane(m.container);
    choose(m.container, "Docked");
    const root = m.container.querySelector("[data-root]") as HTMLElement;
    await act(async () => {
      root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }),
      );
    });
    expect(ports.savePresentation).toHaveBeenCalledWith({
      presentation: "docked",
      forType: null,
    });
    m.unmount();
  });

  it("renders a refusal as the sentence the door gave, and never claims a save", async () => {
    const ports = makePorts();
    ports.savePresentation.mockResolvedValue({
      ok: false,
      reason: "Your organization locks this setting for everyone.",
    });
    const m = mount(<Pane />, ports);
    openThePane(m.container);
    await act(async () => {
      choose(m.container, "Save");
    });
    expect(
      m.container.querySelector("[data-detail-presentation-refusal]")?.textContent,
    ).toContain("locks this setting");
    expect(ports.notify.success).not.toHaveBeenCalled();
    m.unmount();
  });

  // 🚨 NEW-2 (VERIFY-U-P1-R2) — AN EXCEPTION CAN BE TAKEN BACK FROM HERE.
  // The pane could SET a per-record-type exception and offered nothing to
  // remove one: the only escape left was editing the raw json in the generic
  // settings row, which for the person this platform is built for is no escape
  // at all. A removal is the same map-entry write with the key absent.
  it("offers to use the default for this type, and only when there is an exception", async () => {
    const ports = makePorts();
    ports.usePresentationSetting.mockReturnValue({
      value: "page",
      error: null,
      forType: "page",
    });
    const m = mount(<Pane />, ports);
    openThePane(m.container);

    await act(async () => {
      choose(m.container, "Use the default for file records");
    });
    expect(ports.savePresentation).toHaveBeenCalledWith({
      presentation: "page",
      forType: "file",
      clear: true,
    });
    m.unmount();
  });

  it("hides that control when this type has no exception of its own", () => {
    const ports = makePorts();
    ports.usePresentationSetting.mockReturnValue({
      value: "window",
      error: null,
      forType: undefined,
    });
    const m = mount(<Pane />, ports);
    openThePane(m.container);
    expect(
      Array.from(m.container.querySelectorAll("button")).map((b) => b.textContent?.trim()),
    ).not.toContain("Use the default for file records");
    m.unmount();
  });

  it("is absent — never disabled-looking — when the host cannot write the setting", () => {
    const ports = makePorts();
    // A host that only READS the setting binds no writer.
    (ports as { savePresentation?: unknown }).savePresentation = undefined;
    const m = mount(<Pane />, ports);
    expect(m.container.querySelector("[data-detail-presentation-pane]")).toBeNull();
    m.unmount();
  });
});
