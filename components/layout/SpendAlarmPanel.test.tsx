/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SpendAlarmPanel from "./SpendAlarmPanel";

const copied: unknown[] = [];
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: ({ label, agent }: { label: string; agent: () => unknown }) => (
    <button type="button" title={`Copy ${label} for AI`} aria-label={`Copy for AI: ${label}`} onClick={() => copied.push(agent())} />
  ),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (p: { value: string; onChange: (e: { target: { value: string } }) => void; placeholder?: string }) => (
    <textarea data-testid="resolve-note" value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange({ target: { value: e.target.value } })} />
  ),
}));
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
  recordId: "rec-x",
  ackKey: "x:1",
  severity: "warning",
  level: "warning",
  kind: "spend_approval_hold",
  fix: "Approve or reject this run",
  title: "Run held",
  detail: "A run was refused.",
  link: "/administration/billing/alarms/rec-x",
  count: 1,
  costUsd: null,
  costAvoidedUsd: null,
  lastAt: "2026-10-10T10:00:00Z",
  subjectUserId: null,
  ...over,
});

const alarms = [
  mk({ id: "c", recordId: "rec-c", link: "/administration/billing/alarms/rec-c", ackKey: "c:1", level: "critical", severity: "error", title: "Spend spike", fix: "Stop what is driving it" }),
  mk({ id: "w", ackKey: "w:1" }),
  mk({ id: "i", recordId: "rec-i", link: "/administration/billing/alarms/rec-i", ackKey: "i:1", level: "info", fix: "None needed", title: "Source skipped" }),
];

function renderPanel(over: Partial<React.ComponentProps<typeof SpendAlarmPanel>> = {}) {
  const props = { alarms, onOpen: jest.fn(), onResolve: jest.fn(), onSnooze: jest.fn(), onClose: jest.fn(), ...over };
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
    expect([critical, warning, info].map((n) => n.getAttribute("data-level"))).toEqual(["critical", "warning", "info"]);
    expect(new Set([critical, warning, info].map((n) => n.className)).size).toBe(3);
    const icons = [critical, warning, info].map((n) => n.querySelector("svg")?.getAttribute("data-alarm-icon"));
    expect(new Set(icons).size).toBe(3);
  });

  it("lists critical first", () => {
    renderPanel({ alarms: [alarms[2]!, alarms[1]!, alarms[0]!] });
    expect(allAlarms().map((n) => n.getAttribute("data-level"))).toEqual(["critical", "warning", "info"]);
  });

  it("has no Mark reviewed; Resolve says what it does", () => {
    renderPanel();
    expect(document.body.textContent ?? "").not.toMatch(/mark (all )?reviewed|acknowledge/i);
    const resolve = buttons().find((b) => b.textContent?.trim() === "Resolve")!;
    expect(resolve.getAttribute("title")).toBe("Marks this alarm resolved for everyone; it reopens if it happens again");
    for (const b of buttons()) {
      if (b.getAttribute("aria-label") === "Close") continue;
      expect((b.getAttribute("title") ?? "").length).toBeGreaterThan(0);
      expect((b.getAttribute("title") ?? "").length).toBeLessThanOrEqual(140);
    }
  });

  it("Open goes to the alarm's own record page, never a list or person page", () => {
    const props = renderPanel({ alarms: [alarms[0]!] });
    click(button("Open"));
    expect(props.onOpen).toHaveBeenCalledWith("/administration/billing/alarms/rec-c");
  });

  it("an alarm with no record has no Open at all", () => {
    renderPanel({ alarms: [mk({ recordId: null, link: null })] });
    expect(button("Open")).toBeUndefined();
  });

  it("Resolve takes an optional note, then resolves for everyone", () => {
    const props = renderPanel({ alarms: [alarms[0]!] });
    click(buttons().find((b) => b.textContent?.trim() === "Resolve"));
    expect(props.onResolve).not.toHaveBeenCalled();
    const note = byTestId("resolve-note") as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(note, "storm stopped by the skip");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(button("Resolve for everyone"));
    expect(props.onResolve).toHaveBeenCalledWith(alarms[0], "storm stopped by the skip");
  });

  it("Snooze 24h and Remind me later", () => {
    const props = renderPanel({ alarms: [alarms[1]!] });
    click(button("Snooze 24h"));
    expect(props.onSnooze).toHaveBeenCalledWith(alarms[1]);
    click(button("Remind me later"));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onResolve).not.toHaveBeenCalled();
  });

  it("each alarm has Copy for AI carrying its record page and ids", () => {
    copied.length = 0;
    renderPanel({ alarms: [alarms[0]!] });
    click(button("Copy for AI: Spend alarm"));
    const payload = JSON.stringify(copied[0]);
    expect(payload).toContain("/administration/billing/alarms/rec-c");
    expect(payload).toContain("Stop what is driving it");
  });
});
