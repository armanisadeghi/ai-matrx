/**
 * @jest-environment jsdom
 *
 * A Group Chat participant's sent turn says what it was NOT shown, and why:
 * the receipt's `room_view` manifest (aidream `group_chat.stager`) lists every
 * withheld message with its speaker and the rule that withheld it — on the
 * message's receipt and in the room's inspector — never only a count.
 *
 * Use case: the clinic no-show interview's Adversary, set to sees: none — the
 * person's answers and the Architect's reply are withheld from it.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@ai-matrx/agents/generated/stream-events";
import { MessageContextReceiptTable, RoomViewManifestTable, withheldRuleLabel } from "../MessageContextReceipt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM_VIEW: NonNullable<ContextReceiptData["room_view"]> = {
  participant_id: "edge-adversary",
  participant_key: "adversary",
  round: 9,
  policy_version: 4,
  included: [],
  digested: [],
  withheld: [
    { message_id: "m-person-1", conversation_id: "conv-archaeologist", speaker: "person", rule: "sees" },
    { message_id: "m-architect-1", conversation_id: "conv-architect", speaker: "architect", rule: "sees" },
  ],
  error: null,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("lists each withheld message: who said it, the rule, and its words when read", () => {
  act(() =>
    root.render(
      <RoomViewManifestTable
        roomView={ROOM_VIEW}
        speakerName={(k) => (k === "person" ? "You" : "Architect")}
        withheldText={{ "m-person-1": "Patients skip when reminders go out the same morning." }}
      />,
    ),
  );
  expect(host.textContent).toContain("Round 9");
  expect(host.textContent).toContain("Policy v4");
  expect(host.textContent).toContain("0 shown");
  expect(host.textContent).toContain("2 withheld");
  const rows = [...host.querySelectorAll("[data-withheld]")].map((r) => r.textContent);
  expect(rows).toEqual([
    "YouNot in seesPatients skip when reminders go out the same morning.",
    "ArchitectNot in sees—",
  ]);
});

it("the server's rules read as short labels; an unknown rule shows as sent", () => {
  expect(withheldRuleLabel("sees")).toBe("Not in sees");
  expect(withheldRuleLabel("reveal.after_round")).toBe("Before reveal round");
  expect(withheldRuleLabel("reveal.every_rounds")).toBe("Off-reveal round");
  expect(withheldRuleLabel("budget")).toBe("Over budget");
  expect(withheldRuleLabel("feed")).toBe("feed");
});

it("a sent message's receipt carries the manifest under its values", () => {
  const receipt: ContextReceiptData = {
    type: "context_receipt",
    version: 1,
    cap: 50000,
    rows: [],
    blocks: [{ id: "room_view", label: "Group chat", delivered: { chars: 2049, sha256: "x" } }],
    room_view: ROOM_VIEW,
  };
  act(() => root.render(<MessageContextReceiptTable receipt={receipt} />));
  expect(host.querySelector('[data-room-view="adversary"]')).not.toBeNull();
  expect(host.querySelectorAll("[data-withheld]")).toHaveLength(2);
});
