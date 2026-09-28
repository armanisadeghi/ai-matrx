/**
 * THE USE CASE (lane HANDOVER, 2026-09-28). A stranger books an evaluation on Cedar Ridge Physical
 * Therapy's booking page. After holding a time, the page asked "Visit type" in a free-text box —
 * every question was an <input>, whatever its kind — so a patient typed "eval" into a column that
 * takes one of four choices. A choice question is now the public form's own picker, fed by the
 * choices the booking door hands it, and the chosen key is what is sent.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const PICKER_UNDER_TEST = process.env.BOOKING_PICKER_UNDER_TEST ?? "../BookingPicker";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BookingPicker } = require(PICKER_UNDER_TEST) as typeof import("../BookingPicker");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = {
  form_id: "f1111111-1111-4111-8111-111111111111",
  organization_id: "f2222222-2222-4222-8222-222222222222",
  table_id: "f3333333-3333-4333-8333-333333333333",
  title: "Book an evaluation",
  presentation: { questions: [{ field: "visit_type", required: true }, { field: "notes" }] },
  fields: [
    {
      id: "f5555555-5555-4555-8555-555555555551", key: "visit_type", label: "Visit type", type: "list", multi: false,
      parity_type: "select", config: { options_table_id: "f7777777-7777-4777-8777-777777777777" },
      options_table_id: "f7777777-7777-4777-8777-777777777777",
      public_choices: [{ key: "initial_evaluation", label: "Initial Evaluation" }, { key: "follow_up", label: "Follow-up" }],
    },
    { id: "f5555555-5555-4555-8555-555555555552", key: "notes", label: "Visit notes", type: "text", config: {} },
  ],
  honeypot_key: null,
  availability: { timezone: "America/Los_Angeles", slot_minutes: 30, buffer_minutes: 0, lead_minutes: 0, max_per_day: 8, days: 7, windows: [] },
  slots: [{ key: "2026-10-05T16:00:00Z", at: "2026-10-05T16:00:00Z", taken: false, member_user_id: null }],
  state: "open",
  message: null,
};

it("the Visit type is picked from the clinic's choices and sent as its key", async () => {
  const sent: Array<{ url: string; body: unknown }> = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.body) sent.push({ url: u, body: JSON.parse(String(init.body)) });
    if (u.endsWith("/hold") && init?.method === "POST") return new Response(JSON.stringify({ state: "held", hold_id: "h1", expires_at: null }));
    if (u.endsWith("/confirm")) return new Response(JSON.stringify({ state: "booked", booking_ref: "R1" }));
    return new Response(JSON.stringify({ slots: PAGE.slots }));
  }) as typeof fetch;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<BookingPicker page={PAGE as never} />));
  const slot = [...host.querySelectorAll("button")].find((b) => /\d:\d\d/.test(b.textContent ?? ""))!;
  await act(async () => slot.click());
  const select = host.querySelector("select") as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  expect([...select!.options].map((o) => o.textContent)).toContain("Follow-up");
  await act(async () => {
    select!.value = "follow_up";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const book = [...host.querySelectorAll("button")].find((b) => /Book/.test(b.textContent ?? ""))!;
  await act(async () => book.click());
  const confirm = sent.find((s) => s.url.endsWith("/confirm"));
  expect((confirm?.body as { values: Record<string, unknown> }).values.visit_type).toBe("follow_up");
  await act(async () => root.unmount());
});
