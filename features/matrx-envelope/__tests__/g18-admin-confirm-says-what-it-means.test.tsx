/**
 * @jest-environment jsdom
 */
/**
 * THE G18 REVIEW of the admin builder's confirm (2026-10-07): "Delete this
 * Task?" was asked with no task chosen, the admin question said "not just this
 * text" on a page with no text, and the server's "ID is required" named a
 * storage word. The real host question runs; only network and store are faked.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const confirmDialog = jest.fn();
const readSameTitledCreatedAt = jest.fn();
let labelStatus: "ready" | "missing" = "ready";

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
  useResolvedReferenceLabel: () =>
    labelStatus === "ready" ? { display: "G10B Review5", status: "ready" } : { display: "Task", status: "missing" },
  resolveReferenceName: async () => "G10B Review5",
}));
jest.mock("@/features/matrx-envelope/referenceTrash", () => ({
  ...jest.requireActual("@/features/matrx-envelope/referenceTrash"),
  useReferenceTrashed: () => false,
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationName: () => "Ashford Labs",
}));
jest.mock("@/features/matrx-envelope/directiveRecordRow", () => ({
  readDirectiveRecord: async () => ({
    id: "x",
    title: "G10B Review5",
    created_at: "2026-10-02T16:05:00Z",
    organization_id: null,
    deleted_at: null,
  }),
  readSameTitledCreatedAt: (...args: unknown[]) => readSameTitledCreatedAt(...args),
}));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { askDirective, matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";
import { wordServerFieldNames } from "@/features/matrx-envelope/directiveFailureWords";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const TASK_ID = "a8a00001-0000-4000-8000-000000000001";

function request(slug: string, items: Record<string, unknown>[], nounLabel: string): DirectiveAskRequest {
  const directive = decodeDirective({ __kind: slug, items });
  if (!directive) throw new Error(`test shell did not decode: ${slug}`);
  return { directive, items, nounLabel };
}

async function rendered(node: ReactNode, wait?: PromiseLike<unknown>): Promise<string> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<div>{node}</div>);
  });
  await act(async () => {
    await wait;
    for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
  const parts = [host.textContent ?? ""];
  for (const el of host.querySelectorAll("*")) {
    for (const attr of ["title", "aria-label", "href"]) {
      const v = el.getAttribute(attr);
      if (v) parts.push(`[${attr}] ${v}`);
    }
  }
  await act(async () => root.unmount());
  return parts.join("\n");
}

async function question(req: DirectiveAskRequest, surface: "text" | "admin" = "text") {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  if (surface === "admin") await askDirective(req, { surface });
  else await matrxDirectiveHost.ask!(req);
  const opts = confirmDialog.mock.calls[0][0] as {
    title: ReactNode;
    description: ReactNode;
    ready?: PromiseLike<unknown>;
  };
  return {
    title: typeof opts.title === "string" ? opts.title : await rendered(opts.title, opts.ready),
    description: await rendered(opts.description, opts.ready),
  };
}

beforeEach(() => {
  readSameTitledCreatedAt.mockReset();
  readSameTitledCreatedAt.mockResolvedValue([]);
  labelStatus = "ready";
});

describe("G18 — the admin builder's confirm", () => {
  it("a delete with no task chosen says plainly that nothing is chosen", async () => {
    const q = await question(request("directive_v1_delete_task", [{}], "Task"), "admin");
    expect(q.title).toBe("No Task chosen");
    expect(q.description).toContain("Nothing will be deleted. Choose a Task first.");
    expect(q.title).not.toContain("Delete this Task?");
  });

  it("an update with no task chosen says the same", async () => {
    const q = await question(request("directive_v1_update_task", [{ title: "x" }], "Task"), "admin");
    expect(q.title).toBe("No Task chosen");
    expect(q.description).toContain("Nothing will be updated.");
  });

  it("the admin question never mentions 'this text'", async () => {
    const del = await question(request("directive_v1_delete_task", [{ id: TASK_ID }], "Task"), "admin");
    expect(del.description).not.toContain("this text");
    expect(del.description).toContain("Moves G10B Review5 to the trash in");
    const create = await question(request("directive_v1_create_task", [{ title: "G18 a" }], "Task"), "admin");
    expect(create.description).toContain("Adds this Task to Ashford Labs, as you.");
    expect(create.description).not.toContain("this text");
  });

  it("the card in a note still says 'not just this text'", async () => {
    const create = await question(request("directive_v1_create_task", [{ title: "G18 a" }], "Task"));
    expect(create.description).toContain("not just to this text");
  });

  it("a repeat Create warns 'already ran once', the card's rule", async () => {
    const q = await question({ ...request("directive_v1_create_task", [{ title: "G18 a" }], "Task"), again: true }, "admin");
    expect(q.description).toContain("This already ran once.");
  });

  it("the server's 'id is required' reads as the type name, never ID", () => {
    expect(wordServerFieldNames("Nothing was applied — id is required.", "title", "Task")).toBe(
      "Nothing was applied — Task is required.",
    );
  });
});
