/**
 * @jest-environment jsdom
 */
/**
 * THE G3 REVIEW, the confirm's half (nightly clone, 2026-10-02):
 *  - a note's title is stored in `label`, and the confirm said "Label" while the
 *    form said "Title" — the title column reads "Title" everywhere;
 *  - an update confirm said only the new value — it says old → new;
 *  - a create said "your workspace" — it names the organization the write lands in.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const confirmDialog = jest.fn();

jest.mock("@/features/directive-catalog/service", () => ({ confirmDirective: jest.fn() }));
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
  useResolvedReferenceLabel: () => ({ display: "G3 note", status: "ready" }),
  // The confirm reads the name BEFORE it asks (G8A) — the same name.
  resolveReferenceName: async () => "G3 note",
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationName: () => "Ashford Labs",
}));
jest.mock("@/features/matrx-envelope/directiveRecordRow", () => ({
  readDirectiveRecord: async () => ({ id: "x", label: "G3 old note title", content: "old body" }),
}));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

const NOTE_ID = "4127fbc8-0000-4000-8000-000000000002";

function request(slug: string, items: Record<string, unknown>[], nounLabel: string): DirectiveAskRequest {
  const directive = decodeDirective({ __kind: slug, items });
  if (!directive) throw new Error(`test shell did not decode: ${slug}`);
  return { directive, items, nounLabel };
}

async function dialogText(req: DirectiveAskRequest): Promise<string> {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(req);
  const opts = confirmDialog.mock.calls[0][0] as { title: ReactNode; description: ReactNode; ready?: PromiseLike<unknown> };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<div>{opts.description}</div>);
  });
  // The question reads its records first; its yes waits on \`ready\` (G8A).
  await act(async () => {
    await opts.ready;
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
  // Let the current-values read land.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const text = host.textContent ?? "";
  await act(async () => root.unmount());
  return text;
}

describe("the confirm says it the way the form does", () => {
  it("a note's title column reads Title, never Label, and shows old → new", async () => {
    const text = await dialogText(
      request("directive_v1_update_note", [{ id: NOTE_ID, label: "G3 new note title" }], "Note"),
    );
    expect(text).toContain("Title");
    expect(text).not.toContain("Label");
    expect(text).toContain("G3 old note title");
    expect(text).toContain("G3 new note title");
  });

  it("a create names the organization the write lands in, never 'your workspace'", async () => {
    const text = await dialogText(request("directive_v1_create_task", [{ title: "G3 task" }], "Task"));
    expect(text).toContain("Ashford Labs");
    expect(text).not.toContain("workspace");
  });
});
