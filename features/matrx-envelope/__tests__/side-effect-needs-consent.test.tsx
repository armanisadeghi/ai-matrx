/**
 * A SIDE EFFECT FOUND IN CONTENT NEVER RUNS ON AN UNEXPLAINED CLICK — and the
 * question NAMES what it changes.
 *
 * History: a `directive_v1_delete_*` block pasted into a note once deleted on
 * ONE click; 9ea2888a3f made it ask, but "Delete this task?" on a blue button,
 * from inside `confirm` (so the card read "Applying…" while asking). Reviewer,
 * 2026-09-30: the dialog must name the record, a delete must be destructive,
 * and "Applied 1" must be a way into what was written.
 *
 * The ORDER (ask → only a yes applies → nothing reads "Applying" before) is the
 * package's, pinned in `@ai-matrx/content-ir-react`'s directive-honesty test.
 * This pins the HOST: the words, the variant, the live names, and the records.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const confirmDirective = jest.fn();
const confirmDialog = jest.fn();

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
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239).
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
// THE live-name resolver is the platform's own (`useResolvedReferenceLabel`);
// stubbed here to a settled answer so the test reads what the dialog SAYS.
jest.mock("@/features/matrx-envelope/referenceResolvers", () => ({
  ...jest.requireActual("@/features/matrx-envelope/referenceResolvers"),
  useResolvedReferenceLabel: () => ({ display: "REVIEW — task create\nbody", status: "ready" }),
  // The confirm reads the name BEFORE it asks (G8A) — the same name.
  resolveReferenceName: async () => "REVIEW — task create",
}));

// The organization a write lands in, and the record's current values, are read
// live in the app; settled here so the test reads what the dialog SAYS.
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationName: () => "G3 Test Org",
}));
jest.mock("@/features/matrx-envelope/directiveRecordRow", () => ({
  readDirectiveRecord: async () => null,
}));

import { decodeDirective } from "@ai-matrx/content-ir";
import type { DirectiveAskRequest } from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";
import { appliedRecords } from "@/features/matrx-envelope/components/DirectiveConsequence";

const TASK_ID = "4127fbc8-0000-4000-8000-000000000001";

function request(slug: string, items: Record<string, unknown>[]): DirectiveAskRequest {
  const directive = decodeDirective({ __kind: slug, items });
  if (!directive) throw new Error(`test shell did not decode: ${slug}`);
  return { directive, items, nounLabel: "Task" };
}

async function askAndRead(req: DirectiveAskRequest) {
  confirmDialog.mockResolvedValue(false);
  await matrxDirectiveHost.ask!(req);
  expect(confirmDialog).toHaveBeenCalledTimes(1);
  const opts = confirmDialog.mock.calls[0][0] as {
    title: ReactNode;
    description: ReactNode;
    ready?: PromiseLike<unknown>;
    confirmLabel?: string;
    variant?: string;
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <div>
        <h2 data-testid="title">{opts.title}</h2>
        <div data-testid="description">{opts.description}</div>
      </div>,
    );
  });
  // The question reads its records first; its yes waits on \`ready\` (G8A).
  await act(async () => {
    await opts.ready;
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
  const text = (id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
  return { ...opts, title: text("title"), description: text("description") };
}

describe("the host names the consequence before anything runs", () => {
  beforeEach(() => {
    confirmDirective.mockReset();
    confirmDialog.mockReset();
  });

  it("delete: names the record, says it goes to the trash, and is DESTRUCTIVE", async () => {
    const opts = await askAndRead(request("directive_v1_delete_task", [{ id: TASK_ID }]));
    expect(opts.title).toBe("Delete task REVIEW — task create?");
    expect(opts.description).toMatch(/Moves REVIEW — task create to the trash/);
    expect(opts.variant).toBe("destructive");
    expect(opts.confirmLabel).toBe("Delete");
    expect(confirmDirective).not.toHaveBeenCalled();
  });

  it("update: names the record and lists every field it overwrites", async () => {
    const opts = await askAndRead(
      request("directive_v1_update_task", [
        { id: TASK_ID, description: "Ship by Friday", due_date: "2026-10-15" },
      ]),
    );
    expect(opts.title).toBe("Update task REVIEW — task create?");
    const text = opts.description;
    expect(text).toContain("Description→Ship by Friday");
    expect(text).toContain("Due Date→2026-10-15");
    expect(opts.variant).toBeUndefined();
  });

  it("Run again: every class says it runs a SECOND time; a delete stays destructive", async () => {
    const del = await askAndRead({
      ...request("directive_v1_delete_task", [{ id: TASK_ID }]),
      again: true,
    });
    expect(del.title).toBe("Delete task REVIEW — task create again?");
    expect(del.description).toContain("This already ran once.");
    expect(del.variant).toBe("destructive");
    expect(del.confirmLabel).toBe("Delete again");

    confirmDialog.mockReset();
    const create = await askAndRead({
      ...request("directive_v1_create_task", [{ title: "LANE-C — probe" }]),
      again: true,
    });
    expect(create.title).toBe("Create another task LANE-C — probe?");
    expect(create.description).toContain("adds a second copy");
    expect(create.confirmLabel).toBe("Create another");
  });

  it("every dialog description fits the 140-character budget", async () => {
    const cases: DirectiveAskRequest[] = [
      request("directive_v1_delete_task", [{ id: TASK_ID }]),
      request("directive_v1_update_task", [{ id: TASK_ID, status: "done" }]),
      request("directive_v1_create_task", [{ title: "LANE-C — probe" }]),
      { ...request("directive_v1_delete_task", [{ id: TASK_ID }]), again: true },
      { ...request("directive_v1_update_task", [{ id: TASK_ID, status: "done" }]), again: true },
      { ...request("directive_v1_create_task", [{ title: "LANE-C — probe" }]), again: true },
    ];
    for (const req of cases) {
      confirmDialog.mockReset();
      const opts = await askAndRead(req);
      // The sentence only — the change list below it is data, not prose.
      // A failed read adds its own one-line status slot (G8A); it is not the
      // consequence sentence, and has its own budget (secondary, ≤60).
      const unread = "Current values couldn't be read.";
      expect(unread.length).toBeLessThanOrEqual(60);
      const sentence = opts.description.replace(unread, "").split("Status→")[0];
      expect(sentence.length).toBeLessThanOrEqual(140);
    }
  });

  it("create: names what it creates from the item's own title", async () => {
    const opts = await askAndRead(request("directive_v1_create_task", [{ title: "LANE-C — probe" }]));
    expect(opts.title).toBe("Create task LANE-C — probe?");
  });

  it("confirm never asks again (the package asked first) and hands back the server's sentence + records", async () => {
    confirmDirective.mockResolvedValue({
      directive: "directive_v1_create_task",
      proposal_id: "p",
      applied: 1,
      failed: 0,
      message: "Created task “LANE-C — probe”.",
      receipts: [{ kind: "directive_apply.item", resource_kind: "task", resource_ids: [TASK_ID] }],
    });
    const result = await matrxDirectiveHost.confirm!({
      __kind: "directive_v1_create_task",
      items: [{ title: "LANE-C — probe" }],
    });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: 1,
      failed: 0,
      message: "Created task “LANE-C — probe”.",
      records: [{ noun: "task", id: TASK_ID }],
      // A create replaces nothing.
      before: [null],
    });
  });

  it("appliedRecords falls back to the directive noun when a receipt's kind has no resolver", () => {
    expect(
      appliedRecords("directive_v1_create_task", [
        { resource_kind: "not_a_real_kind_xyz", resource_ids: [TASK_ID, TASK_ID] },
        { resource_kind: "task" },
      ]),
    ).toEqual([{ noun: "task", id: TASK_ID }]);
  });
});
