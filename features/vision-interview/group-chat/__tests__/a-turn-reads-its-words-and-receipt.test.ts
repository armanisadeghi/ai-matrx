/**
 * The inspector reads a participant's turn from stored rows: the visible words
 * are the text parts only (never the model's thinking), and the receipt is the
 * user row's `model_context.delivery.receipt` when it is a real one.
 */
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

import { messageText, receiptOf } from "../latestTurn";

it("keeps text parts and drops thinking", () => {
  const content = [
    { type: "thinking", text: "**Defining the Core Task** I'm now zeroing in…" },
    { type: "text", text: "Start with the reminder schedule." },
    { type: "text", text: "Then the waitlist." },
  ];
  expect(messageText(content)).toBe("Start with the reminder schedule.\n\nThen the waitlist.");
  expect(messageText("plain words")).toBe("plain words");
  expect(messageText(null)).toBe("");
});

it("reads the persisted receipt, and nothing that is not one", () => {
  const receipt = { cap: 50000, rows: [], room_view: { round: 9 } };
  expect(receiptOf({ delivery: { receipt } })).toBe(receipt);
  expect(receiptOf({ delivery: { receipt: { rows: [] } } })).toBeNull();
  expect(receiptOf({ delivery: null })).toBeNull();
  expect(receiptOf(null)).toBeNull();
});
