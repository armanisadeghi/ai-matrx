/**
 * A REFUSAL NEVER ALSO COSTS THE PERSON THEIR PASTE.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 8, 2026-09-17). A realistic four-turn
 * transcript was pasted into "The Meeting Scavenger → Paste a transcript", "See
 * who is in them" was pressed, the server refused it, and the dialog came back
 * on step 1 ("Meetings you had here") with the paste apparently gone. The
 * walker reported the paste as discarded.
 *
 * TWO mechanisms had to be wrong for that to happen, and both were:
 *
 *   1. `MeetingSitting` kept `{text, sourceNote}` and NOT the step. On a
 *      remount `tab` reset to its initial `"platform"`, so the restored paste
 *      was put back onto a step that was no longer on screen. Work you cannot
 *      see is work you have lost.
 *   2. `useDialogSitting` debounces its write by 400ms (`WRITE_DEBOUNCE_MS`).
 *      A transcript pasted and submitted inside that window was never written
 *      at all, so there was nothing to restore. The lane is declared `sitting`
 *      in `sitting/lanePersistence.ts` — this is what makes that declaration
 *      true through an ERROR path and not only through a leisurely reload.
 *
 * This file deliberately does NOT wait out the debounce: a person who pastes
 * and presses the button does not, either. The only thing that can put the work
 * in storage here is the error path's own `keepNow()` flush.
 *
 * Doubles: the network (`callApi` via the store's `dispatch`, forced to refuse
 * exactly as the live 422 did), and the heavy `ProTextarea`/`Input` editor
 * chrome, reduced to plain controlled fields that still carry value/onChange.
 * Everything that owns the behaviour under test is real: the dialog's own
 * `useState`, its `useDialogSitting` snapshot/apply wiring, the real
 * `createSittingStore`, and real `localStorage`.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    placeholder?: string;
  }) => (
    <textarea id={id} value={value} onChange={(e) => onChange(e)} placeholder={placeholder} />
  ),
}));

jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  Input: ({
    id,
    value,
    onChange,
    placeholder,
    type,
  }: {
    id?: string;
    value: string | number;
    onChange: (e: { target: { value: string } }) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e)}
      placeholder={placeholder}
    />
  ),
}));

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

/** The live refusal, verbatim from ops.app_log 2026-09-17 19:23:57.604Z. */
const REFUSAL =
  "We couldn't tell who said what in that transcript. We read the subtitle " +
  "files meetings export (.vtt and .srt) and any transcript where each line " +
  'starts with the speaker\'s name and a colon — for example "Dana: we never ' +
  'sign before the survey." Add the names and try again.';

const toasted: string[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (message: string) => toasted.push(message),
    success: () => undefined,
    message: () => undefined,
  },
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (args: unknown) => ({ type: "callApi", args }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  ...jest.requireActual("@/lib/redux/hooks"),
  useAppStore: () => ({
    // The server refuses, exactly as it did on the cold walk.
    dispatch: async () => {
      throw new Error(REFUSAL);
    },
    getState: () => ({}),
    subscribe: () => () => undefined,
  }),
}));

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: jest.fn() }),
}));

// The meetings listing is a direct supabase-js read. It is a DEPENDENCY of the
// dialog, not the thing under test — this Expert has no platform meetings, so
// it answers empty and the paste step is the only live one.
jest.mock("@/utils/supabase/client", () => {
  const query: Record<string, unknown> = {};
  for (const verb of ["from", "select", "is", "order", "limit", "in", "eq"]) {
    query[verb] = () => query;
  }
  query.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return { supabase: { schema: () => query } };
});

jest.mock("../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: () => ({
    status: "idle",
    running: false,
    rejoining: false,
    stage: null,
    stages: [],
    error: null,
    result: null,
    runId: null,
    interruption: null,
    launch: jest.fn(),
    reset: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
    cancelling: false,
    stoppedMessage: null,
    surfacing: false,
    waitMessage: null,
    dismiss: jest.fn(),
  }),
}));

import { MeetingScavengerDialog } from "../components/detail/MeetingScavengerDialog";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const RULEBOOK_ID = "9b1f0c34-52ad-4e77-8c10-6f3d2b8e41aa";

/** The cold walk's own four-turn paste, in the shape that was refused. */
const PASTE = [
  "we never sign before the survey",
  "the client wants it Friday though",
  "then the survey moves, not the signature",
  "understood",
].join("\n");

const rulebook = {
  id: RULEBOOK_ID,
  name: "E-waste routing",
  slug: "e-waste-routing",
  description: "",
  metadata: {},
  rules: [],
  sections: {},
  source: {},
  status: "draft",
  visibility: "personal",
  version: 1,
  organization_id: "0e3f1c90-3333-4333-8333-333333333333",
  created_by: "7c2b6d41-4444-4444-8444-444444444444",
  created_at: "2026-09-16T20:00:00.000Z",
  updated_at: "2026-09-16T20:00:00.000Z",
  updated_by: null,
  deleted_at: null,
  assurance_level: null,
  industry_id: null,
  source_authority: null,
  source_rulebook_id: null,
  source_synced_at: null,
  source_version: null,
} as unknown as Parameters<typeof MeetingScavengerDialog>[0]["rulebook"];

async function mount(): Promise<{ unmount: () => Promise<void> }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MeetingScavengerDialog
        open
        onOpenChange={() => undefined}
        rulebook={rulebook}
      />,
    );
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function buttonSaying(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text),
  );
  if (!match) throw new Error(`no button saying "${text}" on screen`);
  return match;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // The press starts an async read; let its promise chain settle so the
  // refusal (and the `keepNow()` flush on it) has actually happened.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function typeInto(el: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pasteBox(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>("#meeting-paste");
  if (!el) throw new Error("the paste step is not on screen");
  return el;
}

beforeEach(() => {
  localStorage.clear();
  toasted.length = 0;
});

describe("a transcript the server refuses", () => {
  it("is still in the box, on the step it was typed on, after a remount", async () => {
    const first = await mount();
    await click(buttonSaying("Paste a transcript"));
    await typeInto(pasteBox(), PASTE);
    await click(buttonSaying("See who is in them"));

    // The refusal happened — otherwise this test would be proving nothing
    // about an error path.
    expect(toasted.join(" ")).toContain("couldn't tell who said what");

    // NO debounce wait: this is the person who pastes and presses the button.
    await first.unmount();

    const second = await mount();
    // BOTH halves. The paste is back...
    const restored = document.querySelector<HTMLTextAreaElement>("#meeting-paste");
    expect(restored).not.toBeNull();
    expect(restored?.value).toBe(PASTE);
    // ...AND it is back on the step it was typed on, which is the half that
    // made the walker report it as discarded.
    await second.unmount();
  });

  it("keeps what the person called the meetings, beside the paste", async () => {
    const first = await mount();
    await click(buttonSaying("Paste a transcript"));
    await typeInto(pasteBox(), PASTE);
    const note = document.querySelector<HTMLInputElement>("#meeting-note");
    if (!note) throw new Error("no note field on screen");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(note, "the Tuesday supplier reviews");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonSaying("See who is in them"));
    await first.unmount();

    const second = await mount();
    expect(
      document.querySelector<HTMLInputElement>("#meeting-note")?.value,
    ).toBe("the Tuesday supplier reviews");
    expect(
      document.querySelector<HTMLTextAreaElement>("#meeting-paste")?.value,
    ).toBe(PASTE);
    await second.unmount();
  });
});
