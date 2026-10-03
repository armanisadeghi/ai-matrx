/**
 * THE USE CASE (lane MAKE-HOME 1c, verifier walk 2026-10-02). A stranger books an initial evaluation
 * on Cedar Ridge Physical Therapy's booking page, which asks for no email. The thank-you said "We
 * have sent a confirmation." — nothing was sent, and nothing could be. The screen now says the time
 * and, when the clinic wrote one, the clinic's own thank-you; it never claims an email.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// A red proof points this at a scratch copy of the old picker (BOOKING_PICKER_UNDER_TEST), never the real file.
const PICKER_UNDER_TEST = process.env.BOOKING_PICKER_UNDER_TEST ?? "../BookingPicker";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BookingPicker } = require(PICKER_UNDER_TEST) as typeof import("../BookingPicker");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (thankYou: { title: string; body: string } | null) => ({
  form_id: "f1111111-1111-4111-8111-111111111111",
  organization_id: "f2222222-2222-4222-8222-222222222222",
  table_id: "f3333333-3333-4333-8333-333333333333",
  title: "Book an initial evaluation",
  presentation: { questions: [{ field: "notes" }], ...(thankYou ? { thank_you: thankYou } : {}) },
  fields: [{ id: "f5555555-5555-4555-8555-555555555552", key: "notes", label: "What brings you in?", type: "text", config: {} }],
  honeypot_key: null,
  availability: { timezone: "America/Los_Angeles", slot_minutes: 45, buffer_minutes: 0, lead_minutes: 0, max_per_day: 8, days: 7, windows: [] },
  slots: [{ key: "2026-10-06T17:00:00Z", at: "2026-10-06T17:00:00Z", taken: false, member_user_id: null }],
  state: "open",
  message: null,
});

async function book(thankYou: { title: string; body: string } | null): Promise<string> {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/hold") && init?.method === "POST") return new Response(JSON.stringify({ state: "held", hold_id: "h1", expires_at: null }));
    if (u.endsWith("/confirm")) return new Response(JSON.stringify({ state: "booked", booking_ref: "CR-4821" }));
    return new Response(JSON.stringify({ slots: page(null).slots }));
  }) as typeof fetch;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<BookingPicker page={page(thankYou) as never} />));
  const slot = [...host.querySelectorAll("button")].find((b) => /\d:\d\d/.test(b.textContent ?? ""))!;
  await act(async () => slot.click());
  const bookIt = [...host.querySelectorAll("button")].find((b) => /Book/.test(b.textContent ?? ""))!;
  await act(async () => bookIt.click());
  const said = host.textContent ?? "";
  await act(async () => root.unmount());
  host.remove();
  return said;
}

it("a page that took no email never says a confirmation was sent", async () => {
  const said = await book(null);
  expect(said).toContain("You're booked");
  expect(said).not.toMatch(/sent|email/i);
});

it("the clinic's own thank-you is said after the time", async () => {
  const said = await book({ title: "See you soon", body: "Please arrive 10 minutes early." });
  expect(said).toContain("See you soon");
  expect(said).toContain("Please arrive 10 minutes early.");
});
