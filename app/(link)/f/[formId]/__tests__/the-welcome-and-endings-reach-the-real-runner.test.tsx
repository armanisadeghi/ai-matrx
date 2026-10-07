/**
 * @jest-environment jsdom
 */
// app/(link)/f/[formId]/__tests__/the-welcome-and-endings-reach-the-real-runner.test.tsx — TYPEFORM-2.
//
// The page maps the store's snake_case presentation (`welcome`, `endings`) into the runner's spec.
// Proven on the REAL FormRunner (no double): the welcome screen is the first thing drawn, Start
// leads to question one, and the ending the store's route names is the screen after sending —
// its own title, never the plain thank-you.

import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { PublicFormRunner } from "@/app/(link)/f/[formId]/PublicFormRunner";
import type { PublicForm } from "@/features/forms/service";

const FORM: PublicForm = {
  form_id: "47209f01-8d15-421a-be1a-bd3de4578a18",
  organization_id: "11d47e36-4b1e-46b8-bdf6-8ef928b730fb",
  table_id: "50da9456-dfe4-4e48-b076-9dffaacfa422",
  title: "Brightline Social — new client intake",
  presentation: {
    flow: "one-at-a-time",
    questions: [{ field: "company", ask: "What's your company called?" }],
    welcome: { title: "Let's grow your brand", body: "Two minutes.", button_label: "Let's go" },
    endings: [
      { id: "starter", title: "Our Starter Kit is the right fit", body: "We'll send the guide today." },
      { id: "growth", title: "Let's book a strategy call" },
    ],
  },
  fields: [{ id: "c0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6a7b", key: "company", label: "Company", type: "text", config: {}, multi: false, required: false }],
  honeypot_key: null,
  state: "open",
  message: null,
} as unknown as PublicForm;

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

it("draws the welcome first, then question one, then the ending the route named", async () => {
  window.localStorage.clear();
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const body = u.endsWith("/asks")
      ? { ok: true, asks: [{ field: "company", asked: true }], ending: "growth", score: null }
      : u.endsWith("/submit")
        ? { ok: true, state: "accepted", record_id: "r1" }
        : { ok: true };
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<PublicFormRunner form={FORM} />));
  await flush();

  expect(host.textContent).toContain("Let's grow your brand");
  expect(host.textContent).not.toContain("What's your company called?");
  const start = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Let's go")!;
  expect(start).toBeTruthy();
  await act(async () => start.click());
  await flush();
  expect(host.textContent).toContain("What's your company called?");

  const box = host.querySelector("input#form-company") as HTMLInputElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(box, "Ironline Fitness");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => new Promise((r) => setTimeout(r, 400)));
  const send = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Submit")!;
  await act(async () => send.click());
  await act(() => new Promise((r) => setTimeout(r, 50)));
  expect(host.querySelector("[data-records-form-ending]")?.textContent).toBe("Let's book a strategy call");
  act(() => root.unmount());
});

it("never flashes the welcome before a saved place opens (TYPEFORM-2)", async () => {
  window.localStorage.setItem(`matrx:form-place:${FORM.form_id}`, "a-saved-place-secret-1234");
  let answer: (v: unknown) => void = () => undefined;
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    if (String(url).endsWith("/draft/resume")) {
      return new Promise((r) => (answer = r));
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
  }) as unknown as typeof fetch;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<PublicFormRunner form={FORM} />));
  const wrap = host.querySelector("[aria-busy]") as HTMLElement;
  expect(wrap.className).toContain("invisible");
  await act(async () =>
    answer({ ok: true, json: async () => ({ ok: true, answers: { company: "Ironline Fitness" }, saved_at: null }) }),
  );
  await flush();
  expect((host.querySelector("[aria-busy]") as HTMLElement).className).not.toContain("invisible");
  expect(host.textContent).toContain("What's your company called?");
  expect(host.textContent).not.toContain("Let's grow your brand");
  act(() => root.unmount());
});
