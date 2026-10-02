/**
 * @jest-environment jsdom
 */
/**
 * THE G6A REVIEW, item 3 (nightly clone, 2026-10-02): only Create's confirm named
 * the organization. Update, Delete and every "Run again" name it too — an update
 * or delete the organization the RECORD lives in (read from the record, never
 * the switcher), a create or action the one the write is sent with.
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
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  // The ACTIVE organization is a different one: an update must not borrow it.
  selectActiveOrganizationName: () => "Ashford Labs",
}));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizations: () => ({ "org-bellweather": { id: "org-bellweather", name: "Bellweather Co" } }),
}));
jest.mock("@/features/matrx-envelope/directiveRecordRow", () => ({
  readDirectiveRecord: async () => ({ id: "x", title: "G6A old", organization_id: "org-bellweather" }),
}));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

const TASK_ID = "4127fbc8-0000-4000-8000-000000000003";

function request(
  slug: string,
  items: Record<string, unknown>[],
  again = false,
): DirectiveAskRequest {
  const directive = decodeDirective({ __kind: slug, items });
  if (!directive) throw new Error(`test shell did not decode: ${slug}`);
  return { directive, items, nounLabel: "Task", ...(again ? { again: true } : {}) };
}

async function dialogText(req: DirectiveAskRequest): Promise<string> {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(req);
  const opts = confirmDialog.mock.calls[0][0] as { title: ReactNode; description: ReactNode };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<div>{opts.description}</div>);
  });
  // Let the current-values read land.
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
  const text = host.textContent ?? "";
  await act(async () => root.unmount());
  return text;
}

describe("every confirm names the organization it touches", () => {
  const update = ["directive_v1_update_task", [{ id: TASK_ID, title: "G6A new" }]] as const;
  const remove = ["directive_v1_delete_task", [{ id: TASK_ID }]] as const;

  it.each([
    ["an update", update, false],
    ["an update run again", update, true],
    ["a delete", remove, false],
    ["a delete run again", remove, true],
  ])("%s names the organization the record lives in", async (_name, [slug, items], again) => {
    const text = await dialogText(request(slug, [...items] as Record<string, unknown>[], again));
    expect(text).toContain("Bellweather Co");
    expect(text).not.toContain("Ashford Labs");
  });

  it("a create run again names the organization it adds the copy to", async () => {
    const text = await dialogText(request("directive_v1_create_task", [{ title: "G6A task" }], true));
    expect(text).toContain("Ashford Labs");
  });
});
