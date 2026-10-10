/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SpendAlarmPanel from "./SpendAlarmPanel";
import type { SpendAlarm } from "./spendAlarm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const allAlarms = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid^="alarm-"]')];
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button")];
const button = (name: string) => buttons().find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name);
const click = (el: Element | undefined) => {
  expect(el).toBeTruthy();
  act(() => (el as HTMLElement).click());
};

const mk = (over: Partial<SpendAlarm>): SpendAlarm => ({
  id: "x",
  ackKey: "x:1",
  severity: "warning",
  level: "warning",
  fix: "Approve or reject this run",
  title: "Run held",
  detail: "A run was refused.",
  link: "https://manage.aimatrx.com/administration/billing/approvals?id=ap-1",
  count: 1,
  lastAt: "2026-10-10T10:00:00Z",
  subjectUserId: null,
  ...over,
});

const alarms = [
  mk({ id: "c", ackKey: "c:1", level: "critical", severity: "error", title: "Spend spike", fix: "Stop what is driving it" }),
  mk({ id: "w", ackKey: "w:1" }),
  mk({ id: "i", ackKey: "i:1", level: "info", fix: "None needed", title: "Source skipped" }),
];

function renderPanel(over: Partial<React.ComponentProps<typeof SpendAlarmPanel>> = {}) {
  const props = { alarms, onAcknowledge: jest.fn(), onAcknowledgeAll: jest.fn(), onClose: jest.fn(), ...over };
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(<SpendAlarmPanel {...props} />));
  return props;
}

describe("SpendAlarmPanel", () => {
  it("shows one fix line per alarm", () => {
    renderPanel();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Stop what is driving it");
    expect(text).toContain("Approve or reject this run");
  });

  it("marks each level with its own label, icon and color", () => {
    renderPanel();
    const critical = byTestId("alarm-c")!;
    const warning = byTestId("alarm-w")!;
    const info = byTestId("alarm-i")!;
    expect(critical.getAttribute("data-level")).toBe("critical");
    expect(warning.getAttribute("data-level")).toBe("warning");
    expect(info.getAttribute("data-level")).toBe("info");
    const classes = [critical, warning, info].map((n) => n.className);
    expect(new Set(classes).size).toBe(3);
    const icons = [critical, warning, info].map((n) => n.querySelector("svg")?.getAttribute("data-alarm-icon"));
    expect(new Set(icons).size).toBe(3);
  });

  it("lists critical first", () => {
    renderPanel({ alarms: [alarms[2]!, alarms[1]!, alarms[0]!] });
    const order = allAlarms().map((n) => n.getAttribute("data-level"));
    expect(order).toEqual(["critical", "warning", "info"]);
  });

  it("names the verbs with tooltips, and has no Acknowledge", () => {
    renderPanel();
    expect(document.body.textContent ?? "").not.toMatch(/acknowledge/i);
    const reviewed = buttons().find((b) => b.textContent?.trim() === "Mark reviewed")!;
    expect(reviewed.getAttribute("title")).toBe("Hide until it happens again");
    expect(button("Remind me later")!.getAttribute("title")).toBeTruthy();
    for (const b of buttons()) {
      if (b.getAttribute("aria-label") === "Close") continue;
      expect((b.getAttribute("title") ?? "").length).toBeGreaterThan(0);
      expect((b.getAttribute("title") ?? "").length).toBeLessThanOrEqual(140);
    }
  });

  it("marks one reviewed, and Remind me later closes without marking", () => {
    const props = renderPanel();
    click(buttons().find((b) => b.textContent?.trim() === "Mark reviewed"));
    expect(props.onAcknowledge).toHaveBeenCalledWith("c:1");
    click(button("Remind me later"));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onAcknowledgeAll).not.toHaveBeenCalled();
  });

  it("Mark all reviewed asks once, naming the count, before it acts", () => {
    const props = renderPanel();
    click(button("Mark all reviewed"));
    expect(props.onAcknowledgeAll).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Mark all 3 reviewed?");
    click(button("Yes, mark 3"));
    expect(props.onAcknowledgeAll).toHaveBeenCalledTimes(1);
  });

  it("opens the exact record link", () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderPanel({ alarms: [alarms[1]!] });
    click(button("Open"));
    expect(open).toHaveBeenCalledWith(
      "https://manage.aimatrx.com/administration/billing/approvals?id=ap-1",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
