/**
 * @jest-environment jsdom
 *
 * GATES-TAIL-2. An executor's tool-binding "Active" switch flipped before `tool.binding` was
 * written and, on a refusal, snapped back with the raw error text in a toast. Rule: pending,
 * never optimistic; a refusal is said in words with a remedy; an update RLS filtered to zero
 * rows is a refusal too (it answers without an error).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() },
  recordToast: { success: jest.fn() },
  dismissRecordToasts: jest.fn(),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: (p: { children: React.ReactNode }) => <a>{p.children}</a> }));
jest.mock("@/components/official/entity-ref/AiIdentityRef", () => ({ AiToolRef: (p: { name?: string }) => <span>{p.name}</span> }));
jest.mock("@/features/tool-call-visualization/admin/mcp-tools/source-kind-badge", () => ({ SourceKindBadge: () => null }));
jest.mock("@/features/tool-registry/executor-surfaces/components/AddToolBindingDialog", () => ({ AddToolBindingDialog: () => null }));
jest.mock("@/components/loaders/SuspenseLoader", () => ({ __esModule: true, default: () => null }));

const listBindingsForExecutor = jest.fn();
const updateBinding = jest.fn();
jest.mock("@/features/tool-registry/executor-surfaces/services/executor-surfaces.service", () => ({
  listBindingsForExecutor: (...a: unknown[]) => listBindingsForExecutor(...a),
  updateBinding: (...a: unknown[]) => updateBinding(...a),
  removeBinding: jest.fn(),
}));

import { ExecutorSurfaceDetailPanel } from "../ExecutorSurfaceDetailPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = {
  tool_id: "7f1c2d3e-0000-4000-8000-00000000a001",
  executor_name: "desktop-local",
  tool_name: "read_calendar_week",
  tool_source_kind: "native",
  tool_is_active: true,
  tool_category: "calendar",
  tool_description: "Read the week's calendar events",
  is_active: true,
};
const EXECUTOR = { name: "desktop-local" } as never;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<ExecutorSurfaceDetailPanel executor={EXECUTOR} onMutated={() => undefined} />); });
  await flush();
  const sw = () => el.querySelector('[role="switch"]') as HTMLButtonElement;
  return { el, sw, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  jest.resetAllMocks();
  listBindingsForExecutor.mockResolvedValue([ROW]);
});

it("keeps the switch on (and busy) while the write is in flight; turns off once it lands", async () => {
  let answer!: () => void;
  updateBinding.mockImplementation(() => new Promise<void>((r) => { answer = r; }));
  const v = await mount();
  expect(v.sw().getAttribute("aria-checked")).toBe("true");
  await act(async () => { v.sw().click(); });
  await flush();
  expect(v.sw().getAttribute("aria-checked")).toBe("true");
  expect(v.sw().disabled).toBe(true);
  expect(v.sw().getAttribute("aria-busy")).toBe("true");
  await act(async () => { answer(); });
  await flush();
  expect(v.sw().getAttribute("aria-checked")).toBe("false");
  v.unmount();
});

it("a refusal leaves it on and says so in words, never the database's line", async () => {
  updateBinding.mockRejectedValue(
    Object.assign(new Error("new row violates row-level security policy for table \"binding\""), { code: "42501" }),
  );
  const v = await mount();
  await act(async () => { v.sw().click(); });
  await flush();
  expect(v.sw().getAttribute("aria-checked")).toBe("true");
  expect(toastError).toHaveBeenCalled();
  const [title, opts] = toastError.mock.calls[0] as [string, { description?: string } | undefined];
  const said = `${title} ${opts?.description ?? ""}`;
  expect(said).toMatch(/^Could not /);
  expect(said).not.toMatch(/row-level|violates|binding"/);
  v.unmount();
});
