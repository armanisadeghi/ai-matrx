/**
 * @jest-environment jsdom
 */
// features/forms/__tests__/the-public-page-hands-the-owners-conditions-to-the-store.test.tsx
//
// LANE FORMS-FIX-1. The public form at `/f/<id>` dropped every question's `showIf` on its
// way into the runner, so a stranger was shown every conditional question and the owner's
// branching never applied — the runner could not even say so, because it never saw a
// condition. These clauses pin the page's half: the condition TRAVELS with the question, and
// the runner is handed a port that asks the store (`/api/forms/<id>/asks`, which calls
// `custom.form_public_asks`) with the answers so far, and relays the store's answer whole.
//
// Coastline Physical Therapy's new-patient form: "When did the injury happen?" is asked only
// when "Is this visit about an injury?" is "Yes".

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return root;
}

// The factory is required lazily inside the closure (Jest's documented pattern for a shared
// mock factory) because `jest.mock(...)` calls are hoisted above this file's `import`
// statements, so a statically-imported reference is not yet initialized when this runs.
jest.mock("@ai-matrx/records-ui", () =>
  require("./records-ui-test-double").mockRecordsUiFormRunnerFactory()
);

import { mockFormRunnerCalls } from "./records-ui-test-double";
const seen = mockFormRunnerCalls;

import { PublicFormRunner } from "@/app/(link)/f/[formId]/PublicFormRunner";
import type { PublicForm } from "@/features/forms/service";

const INJURY_FIELD = "6f2a1d3b-8c4e-4d9f-8b2a-3e4d5c6b7a8f";
const SHOW_IF = { op: "eq", args: [{ field: INJURY_FIELD }, { const: "Yes" }] };

const FORM: PublicForm = {
  form_id: "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e",
  organization_id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  table_id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
  title: "Coastline Physical Therapy — new patient",
  presentation: {
    flow: "one-at-a-time",
    questions: [
      { field: "patient_name", ask: "Patient name", required: true },
      { field: "injury_related", ask: "Is this visit about an injury?" },
      { field: "injury_date", ask: "When did the injury happen?", showIf: SHOW_IF },
    ],
  },
  fields: [],
  honeypot_key: null,
  state: "open",
  message: null,
};

describe("the public form page hands the owner's conditions to the store", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("keeps each question's condition on its way into the runner", () => {
    render(<PublicFormRunner form={FORM} />);
    const form = seen.at(-1)!["form"] as { questions: Array<{ field: string; showIf?: unknown }> };
    expect(form.questions.find((q) => q.field === "injury_date")?.showIf).toEqual(SHOW_IF);
    expect(form.questions.find((q) => q.field === "patient_name")?.showIf ?? null).toBeNull();
  });

  it("gives the runner a port that asks the store with the answers so far, and relays its answer", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const answer = { ok: true, asks: [{ field: "injury_date", asked: false, said: null }] };
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return { ok: true, json: async () => answer } as Response;
    }) as unknown as typeof fetch;

    render(<PublicFormRunner form={FORM} />);
    const port = seen.at(-1)!["whichAsked"] as (v: Record<string, unknown>) => Promise<unknown>;
    expect(typeof port).toBe("function");
    const told = await port({ injury_related: "No" });
    expect(calls[0]!.url).toBe(`/api/forms/${FORM.form_id}/asks`);
    expect(calls[0]!.body).toEqual({ values: { injury_related: "No" } });
    expect(told).toEqual({ ok: true, asks: answer.asks });
  });

  it("a refused door is a sentence, never a silent hide", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, message: "This form could not work out which questions come next, so all of them are shown." }),
    })) as unknown as typeof fetch;
    render(<PublicFormRunner form={FORM} />);
    const port = seen.at(-1)!["whichAsked"] as (v: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>;
    const told = await port({});
    expect(told.ok).toBe(false);
    expect(told.message).toMatch(/all of them are shown/);
  });
});
