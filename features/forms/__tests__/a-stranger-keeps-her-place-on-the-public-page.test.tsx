/**
 * @jest-environment jsdom
 */
// features/forms/__tests__/a-stranger-keeps-her-place-on-the-public-page.test.tsx
//
// LANE S7-PRIME. The public form page's half of three things the champions do on the one page
// every stranger opens:
//
//   · PREFILL BY LINK — `?referring_clinic=Harbor+Sports+Medicine` starts the form with that
//     answer, only for a question the form asks, coerced to its Field's kind;
//   · KEEP MY PLACE — each change is saved a moment later through `/api/forms/<id>/draft`
//     (`custom.form_draft_save`), the secret kept in this browser; coming back through the
//     link's `#resume=` fragment opens the saved answers; sending uses the place up, because the
//     secret travels as the submission's client key;
//   · LEAVE BY THE OWNER'S DOOR — the store's `thank_you.redirect_url` reaches the runner.
//
// Ridgeline Physical Therapy's new-patient intake: Harbor Sports Medicine refers Leilani Okafor.

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({}) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { root, host };
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
import { prefillFromLink, type PublicForm } from "@/features/forms/service";

const FORM: PublicForm = {
  form_id: "3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b",
  organization_id: "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c",
  table_id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
  title: "New patient intake",
  presentation: {
    flow: "one-at-a-time",
    questions: [
      { field: "referring_clinic", ask: "Which clinic referred you?" },
      { field: "full_name", ask: "Your full name", required: true },
      { field: "visits_so_far", ask: "Physical therapy visits so far this year" },
      { field: "phone", ask: "Best number to reach you", required: true },
    ],
    thank_you: {
      title: "You are all set",
      body: "Next, book your first visit — it takes a minute.",
      redirect_url: "https://book.ridgeline-pt.test/first-visit",
    },
  },
  fields: [
    { id: "6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e", key: "referring_clinic", label: "Referring clinic", type: "text" },
    { id: "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f", key: "full_name", label: "Full name", type: "text" },
    { id: "8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a", key: "visits_so_far", label: "Visits", type: "range", config: { kind: "number" } },
    { id: "9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b", key: "phone", label: "Mobile phone", type: "text" },
  ],
  honeypot_key: "confirm_ab12",
  state: "open",
  message: null,
};

const SECRET = "qT3xL9vR2mK8pZ5wN1cB7dF4gH6jS0aE";

type Call = { url: string; body: Record<string, unknown> };
function mockFetch(reply: (url: string, body: Record<string, unknown>) => Record<string, unknown>) {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    const answer = reply(String(url), body);
    return { ok: answer["ok"] !== false, json: async () => answer } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  seen.length = 0;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/f/" + FORM.form_id);
  jest.useRealTimers();
});

describe("prefill by link", () => {
  it("takes only the questions the form asks, coerced to each Field's kind", () => {
    const { answers, ignored } = prefillFromLink(FORM, {
      referring_clinic: "Harbor Sports Medicine",
      visits_so_far: "3",
      insurance_member_id: "XJ-99",
      resume: "never-a-question",
    });
    expect(answers).toEqual({ referring_clinic: "Harbor Sports Medicine", visits_so_far: 3 });
    expect(ignored).toEqual(["insurance_member_id"]);
  });

  it("drops a value that cannot be its Field's kind instead of refusing the page", () => {
    const { answers, ignored } = prefillFromLink(FORM, { visits_so_far: "three", full_name: "Leilani Okafor" });
    expect(answers).toEqual({ full_name: "Leilani Okafor" });
    expect(ignored).toEqual(["visits_so_far"]);
  });

  it("hands the prefilled answers to the runner, and the owner's redirect with the thank-you", () => {
    mockFetch(() => ({ ok: true, asks: [] }));
    render(<PublicFormRunner form={FORM} prefill={{ referring_clinic: "Harbor Sports Medicine" }} />);
    const props = seen.at(-1)!;
    expect(props["initialAnswers"]).toEqual({ referring_clinic: "Harbor Sports Medicine" });
    expect(props["resumed"]).toBe(false);
    expect((props["form"] as { thankYou: unknown }).thankYou).toEqual({
      title: "You are all set",
      body: "Next, book your first visit — it takes a minute.",
      redirectUrl: "https://book.ridgeline-pt.test/first-visit",
    });
  });
});

describe("keep my place", () => {
  it("saves a moment after a change, keeps the secret here, and sends it as the client key", async () => {
    jest.useFakeTimers();
    const calls = mockFetch((url) =>
      url.endsWith("/draft")
        ? { ok: true, state: "saved", draft: SECRET, saved_at: new Date().toISOString(), expires_at: null, message: null }
        : url.endsWith("/submit")
          ? { ok: true, state: "accepted", record_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", message: null }
          : { ok: true, asks: [] },
    );
    render(<PublicFormRunner form={FORM} />);
    const change = seen.at(-1)!["onAnswersChange"] as (a: Record<string, unknown>) => void;
    act(() => change({ referring_clinic: "Harbor Sports Medicine", full_name: "Leilani Okafor" }));
    // Not per keystroke: nothing is sent until she pauses.
    expect(calls.filter((c) => c.url.endsWith("/draft"))).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const saves = calls.filter((c) => c.url.endsWith("/draft"));
    expect(saves).toHaveLength(1);
    expect(saves[0]!.body).toEqual({
      answers: { referring_clinic: "Harbor Sports Medicine", full_name: "Leilani Okafor" },
      draft: null,
    });
    expect(window.localStorage.getItem(`matrx:form-place:${FORM.form_id}`)).toBe(SECRET);

    jest.useRealTimers();
    const onSubmit = seen.at(-1)!["onSubmit"] as (v: Record<string, unknown>) => Promise<{ ok: boolean }>;
    let told: { ok: boolean } = { ok: false };
    await act(async () => {
      told = await onSubmit({ full_name: "Leilani Okafor", phone: "+1 808 555 0161" });
    });
    expect(told.ok).toBe(true);
    const sent = calls.find((c) => c.url.endsWith("/submit"))!;
    expect(sent.body["clientKey"]).toBe(SECRET);
    // Sent: this browser forgets the place.
    expect(window.localStorage.getItem(`matrx:form-place:${FORM.form_id}`)).toBeNull();
  });

  it("opens the saved answers from the link's #resume fragment, and takes the secret out of the address bar", async () => {
    window.history.replaceState(null, "", `/f/${FORM.form_id}#resume=${SECRET}`);
    const calls = mockFetch((url) =>
      url.endsWith("/draft/resume")
        ? {
            ok: true,
            state: "found",
            answers: { referring_clinic: "Harbor Sports Medicine", full_name: "Leilani Okafor" },
            saved_at: new Date().toISOString(),
            expires_at: null,
            message: null,
          }
        : { ok: true, asks: [] },
    );
    const { host } = render(<PublicFormRunner form={FORM} prefill={{ referring_clinic: "Someone Else" }} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const resume = calls.find((c) => c.url.endsWith("/draft/resume"))!;
    expect(resume.body).toEqual({ draft: SECRET });
    expect(window.location.hash).toBe("");
    // Her saved answers win over the link's.
    expect(seen.at(-1)!["initialAnswers"]).toEqual({ referring_clinic: "Harbor Sports Medicine", full_name: "Leilani Okafor" });
    // A saved place opens where she left off; a prefill alone does not.
    expect(seen.at(-1)!["resumed"]).toBe(true);
    expect(host.textContent).toMatch(/Picked up where you left off/);
    expect(window.localStorage.getItem(`matrx:form-place:${FORM.form_id}`)).toBe(SECRET);
  });

  it("a place that is gone says so in the store's words, and the form starts fresh", async () => {
    window.history.replaceState(null, "", `/f/${FORM.form_id}#resume=${SECRET}`);
    mockFetch((url) =>
      url.endsWith("/draft/resume")
        ? { ok: false, state: "submitted", answers: null, message: "These answers were already sent, on September 23, 2026. There is nothing left to finish." }
        : { ok: true, asks: [] },
    );
    const { host } = render(<PublicFormRunner form={FORM} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toMatch(/already sent/);
    expect(seen.at(-1)!["initialAnswers"]).toEqual({});
  });
});
