/**
 * EVERY BOOKING QUESTION IS THE FORM'S OWN CONTROL (lane HANDOVER, 2026-09-29).
 *
 * Cedar Ridge Physical Therapy's booking page asked "Visit notes" (a multi-line column) in a
 * one-line box, and would have asked a date by typing: the page drew choices with the form's own
 * control and everything else with a hand-rolled <input>. Every question now goes through the one
 * control the public form and the grid use.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const PICKER_UNDER_TEST = process.env.BOOKING_PICKER_UNDER_TEST ?? "../BookingPicker";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BookingPicker } = require(PICKER_UNDER_TEST) as typeof import("../BookingPicker");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = {
  form_id: "f1111111-1111-4111-8111-111111111112",
  organization_id: "f2222222-2222-4222-8222-222222222222",
  table_id: "f3333333-3333-4333-8333-333333333333",
  title: "Book a 30-minute visit",
  presentation: { questions: [{ field: "notes" }, { field: "surgery_date" }] },
  fields: [
    { id: "f5555555-5555-4555-8555-555555555552", key: "notes", label: "Visit notes", type: "text", config: { multiline: true } },
    { id: "f5555555-5555-4555-8555-555555555553", key: "surgery_date", label: "Date of surgery", type: "range", parity_type: "datetime", config: { kind: "date" } },
  ],
  honeypot_key: null,
  availability: { timezone: "America/Los_Angeles", slot_minutes: 30, buffer_minutes: 0, lead_minutes: 0, max_per_day: 8, days: 7, windows: [] },
  slots: [{ key: "2026-10-05T16:00:00Z", at: "2026-10-05T16:00:00Z", taken: false, member_user_id: null }],
  state: "open",
  message: null,
};

it("a multi-line question is a text area and a date question is a date control", async () => {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/hold") && init?.method === "POST") return new Response(JSON.stringify({ state: "held", hold_id: "h1", expires_at: null }));
    return new Response(JSON.stringify({ slots: PAGE.slots }));
  }) as typeof fetch;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<BookingPicker page={PAGE as never} />));
  const slot = [...host.querySelectorAll("button")].find((b) => /\d:\d\d/.test(b.textContent ?? ""))!;
  await act(async () => slot.click());
  expect(host.querySelector("textarea")).not.toBeNull();
  expect(host.querySelector('input[type="date"], input[type="datetime-local"]')).not.toBeNull();
  await act(async () => root.unmount());
});
