/**
 * @jest-environment jsdom
 */
/**
 * THE G7 REVIEW (nightly clone, 2026-10-02): an Update card's confirm said the
 * old title was "G6A renamed target" while the database already held "G6A
 * second rename". The record's current values were read ONCE per record, so
 * after Update A applied, Update B's confirm for the same record — drawn into a
 * dialog body the layer kept mounted — still said A's OLD value was the old one.
 *
 * Apply update A, then open update B's confirm for the same record: B's old
 * value is A's new value. Both ways the dialog can be drawn — the body kept
 * mounted between questions, and a fresh body while a read started BEFORE the
 * write is still in flight — and through the real `readDirectiveRecord`.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const confirmDialog = jest.fn();
const confirmDirective = jest.fn();

// The database: one task row, and every read of it the page makes.
const db = { title: "G7 original" };
const pendingReads: Array<() => void> = [];
let holdReads = false;

jest.mock("@/utils/supabase/client", () => {
  const read = () =>
    new Promise((resolve) => {
      // The server reads the row when it is ASKED; a slow answer still carries
      // what the row held then.
      const seen = db.title;
      const answer = () => resolve({ data: { id: TASK_ID_FOR_MOCK, title: seen }, error: null });
      if (holdReads) pendingReads.push(answer);
      else answer();
    });
  const from = () => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) });
  return { supabase: { from, schema: () => ({ from }) } };
});
const TASK_ID_FOR_MOCK = "7a7a7a7a-4b5a-4968-8776-655443322177";

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: (...args: unknown[]) => confirmDirective(...args),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => confirmDialog(...args),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}), dispatch: jest.fn() }),
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://server.example.test",
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => jest.fn(),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
jest.mock("@/features/matrx-envelope/referenceResolvers", () => ({
  ...jest.requireActual("@/features/matrx-envelope/referenceResolvers"),
  useResolvedReferenceLabel: () => ({ display: "G7 task", status: "ready" }),
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationName: () => "Ashford Labs",
}));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({ selectOrganizations: () => ({}) }));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

const TASK_ID = TASK_ID_FOR_MOCK;

function updateRequest(title: string): DirectiveAskRequest {
  const items = [{ id: TASK_ID, title }];
  const directive = decodeDirective({ __kind: "directive_v1_update_task", items });
  if (!directive) throw new Error("test shell did not decode");
  return { directive, items, nounLabel: "Task" };
}

async function confirmBody(title: string): Promise<ReactNode> {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(updateRequest(title));
  return (confirmDialog.mock.calls[0][0] as { description: ReactNode }).description;
}

/** Update A lands on the server, through the host's real `confirm`. */
async function applyUpdateA(): Promise<void> {
  confirmDirective.mockImplementation(async () => {
    const before = db.title;
    db.title = "G7 A title";
    return {
      directive: "directive_v1_update_task",
      proposal_id: "p",
      applied: 1,
      failed: 0,
      message: "Updated task.",
      receipts: [
        { kind: "directive_apply.item", resource_kind: "task", resource_ids: [TASK_ID], before: { title: before } },
      ],
    };
  });
  await act(async () => {
    await matrxDirectiveHost.confirm!({
      __kind: "directive_v1_update_task",
      items: [{ id: TASK_ID, title: "G7 A title" }],
    });
  });
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });

const oldValue = (host: HTMLElement) =>
  host.querySelector('[data-change-key="title"] [data-change-before]')?.textContent ?? null;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  db.title = "G7 original";
  holdReads = false;
  pendingReads.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("a confirm shows the record as it is NOW", () => {
  it("after update A applies, update B's confirm (body kept mounted) shows A's new value as old", async () => {
    const a = await confirmBody("G7 A title");
    await act(async () => root.render(<div>{a}</div>));
    await settle();
    expect(oldValue(host)).toBe("G7 original");

    await applyUpdateA();

    const b = await confirmBody("G7 B title");
    await act(async () => root.render(<div>{b}</div>));
    await settle();
    expect(oldValue(host)).toBe("G7 A title");
  });

  it("a read started before update A is never handed to B's confirm opened after it", async () => {
    // A card row reads the record; the answer is still on its way.
    holdReads = true;
    const a = await confirmBody("G7 A title");
    await act(async () => root.render(<div>{a}</div>));
    await act(async () => root.unmount());

    holdReads = false;
    await applyUpdateA();

    root = createRoot(host);
    const b = await confirmBody("G7 B title");
    await act(async () => root.render(<div>{b}</div>));
    // Only now does the pre-write read answer.
    for (const answer of pendingReads.splice(0)) answer();
    await settle();
    expect(oldValue(host)).toBe("G7 A title");
  });
});
