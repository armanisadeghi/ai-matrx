/**
 * @jest-environment jsdom
 *
 * The Group chat inspector opens at the canvas's default width (~360px). Its roster once was a
 * <table> whose scroll container grew to 474px, clipping the Labels column. Layout cannot be
 * measured in jsdom, so this guard pins the structure that made it overflow: no table, no
 * horizontal scroller, no fixed pixel min-width anywhere in a rendered 360px host, and every
 * control (Sees, Labels, Reveal, Cadence, Budget) present in the row. The pixel check is done in
 * the browser (see the commit).
 *
 * Use case: the creator opens the inspector beside a three-participant clinic interview.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const participant = (key: string, label: string) => ({
  id: `edge-${key}`,
  conversation_id: `conv-${key}`,
  position: 1,
  participant: { __kind: "room_view_policy" as const, key, label, policy: { sees: "everyone" as const }, policy_version: 2 },
});
const GROUP = {
  anchor_type: "interview_session",
  anchor_id: "s1",
  round: 3,
  participants: [participant("adversary", "Adversary"), participant("coach", "Coach")],
};

jest.mock("../useGroupChat", () => ({
  useGroupChat: () => ({ state: { status: "ready", group: GROUP }, saving: null, savePolicy: jest.fn(), reload: jest.fn() }),
}));
jest.mock("../latestTurn", () => ({
  fetchLatestTurn: () => new Promise(() => {}),
  hitOutputLimit: () => false,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => [], useAppDispatch: () => jest.fn() }));
jest.mock("../../redux/vision-interview.slice", () => ({ selectTurnsOrdered: () => [] }));
jest.mock("@ai-matrx/chat/agents/components/context-policies-display/MessageContextReceipt", () => ({ RoomViewReceipt: () => null }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

import { GroupChatInspector } from "../GroupChatInspector";

it("renders every control with no table, no horizontal scroller and no fixed min-width at 360px", async () => {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<GroupChatInspector anchorType="interview_session" anchorId="s1" />);
  });
  expect(host.querySelectorAll("[data-participant-rules]")).toHaveLength(2);
  expect(host.querySelector("table")).toBeNull();
  for (const label of ["Sees", "Labels", "Reveal", "Cadence", "Budget (characters)"]) {
    expect(host.querySelectorAll(`[aria-label="${label}"]`).length).toBeGreaterThanOrEqual(2);
  }
  const offenders = Array.from(host.querySelectorAll("*")).filter((el) => {
    const cls = (el.getAttribute("class") ?? "").split(/\s+/);
    return cls.includes("overflow-x-auto") || cls.includes("overflow-x-scroll") || cls.some((c) => /^min-w-\[\d+(px|rem)\]$/.test(c));
  });
  expect(offenders.map((e) => e.getAttribute("class"))).toEqual([]);
});
