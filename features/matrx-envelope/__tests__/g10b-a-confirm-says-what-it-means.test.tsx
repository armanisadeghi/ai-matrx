/**
 * @jest-environment jsdom
 */
/**
 * THE G10B REVIEW of the action cards' words (nightly clone, 2026-10-02):
 *  2. "Create project Item?" — a placeholder presented as a name; the error
 *     said "name is required" where the form said "Title"; the remedy was
 *     "Edit the block"; titles lowercased the type ("Create task …");
 *  3. "Delete task Review5?" did not say which of two tasks named Review5;
 *  4. the confirm reads its record again although the card just read it;
 *  5. a link to a record that does not exist hovered "Open Task a8a00001".
 * Every assertion here runs the REAL host (`matrxDirectiveHost`) and the real
 * question (`directiveConsequenceDialog`); only the network and store are faked.
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
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";
import { DirectiveRecordLink } from "@/features/matrx-envelope/components/DirectiveConsequence";
import { explainDirectiveFailure } from "@/features/matrx-envelope/directiveFailureWords";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASK_ID = "a8a00001-0000-4000-8000-000000000001";

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

async function question(req: DirectiveAskRequest) {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(req);
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

describe("a confirm says what it means", () => {
  it("a create with no title says so — never a placeholder as the name", async () => {
    const q = await question(request("directive_v1_create_project", [{ name: "" }], "Project"));
    expect(q.title).toBe("Create a Project with no title?");
    expect(q.title).not.toContain("Item");
  });

  it("titles use the type's display name, as the card and the picker do", async () => {
    const q = await question(request("directive_v1_create_task", [{ title: "G10B task" }], "Task"));
    expect(q.title).toContain("Create Task");
    expect(q.title).not.toMatch(/Create task/);
  });

  it("a record that shares its name with another says which one it is", async () => {
    readSameTitledCreatedAt.mockResolvedValue(["2026-10-02T09:00:00Z"]);
    const q = await question(request("directive_v1_delete_task", [{ id: TASK_ID }], "Task"));
    expect(q.title).toMatch(/Delete Task G10B Review5 \(Created [A-Z][a-z]{2} \d+, \d+:\d{2}/);
  });

  it("a record whose name is its own adds nothing", async () => {
    const q = await question(request("directive_v1_delete_task", [{ id: TASK_ID }], "Task"));
    expect(q.title).toBe("Delete Task G10B Review5?");
  });
});

describe("a refused write says it in the form's words, with a remedy a person can do", () => {
  it("names the field as the form does and never says 'Edit the block'", () => {
    const words = explainDirectiveFailure({
      raw: "Nothing was applied — name is required.",
      directiveClass: "create",
      noun: "project",
      nounLabel: "Project",
    });
    expect(words?.what).toBe("Nothing was applied — Title is required.");
    expect(words?.next).not.toMatch(/block/i);
  });

  it("words every field it names, the tail kept", () => {
    const words = explainDirectiveFailure({
      raw: "Nothing was applied — items.0.title is required; due_date: Input should be a valid date, and 2 more.",
      directiveClass: "create",
      noun: "task",
      nounLabel: "Task",
    });
    expect(words?.what).toBe(
      "Nothing was applied — Title is required; Due Date: Input should be a valid date, and 2 more.",
    );
  });
});

describe("a record that does not exist is never a door", () => {
  it("shows no id in its text, tooltip or label, and does not link", async () => {
    labelStatus = "missing";
    const out = await rendered(
      <DirectiveRecordLink noun="task" id={TASK_ID} fallback="Task" context="row" />,
    );
    expect(out).not.toContain("a8a00001");
    expect(out).toContain("Not found");
    expect(out).not.toMatch(/\[href\]|Open /);
  });
});
