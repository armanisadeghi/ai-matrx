/**
 * A SCOPE TYPE'S DESCRIPTION IS EDITED AND SAVED (lane SCOPES-REVIEW-FIXES, 2026-10-09). The merge of
 * the two EditScopeTypeSheet copies dropped the "Description (optional)" box the scope-system copy
 * had, so a type's description could no longer be changed from the sheet. RED before: no box, and
 * `updateScopeType` was never handed `description`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SCOPE_TYPE = {
  id: "5155b79c-4c54-4694-b644-2e21ea6833b7",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  label_singular: "Matter",
  label_plural: "Matters",
  icon: "Folder",
  color: "blue",
  slug: "matters",
  description: "Workers' compensation matters",
  sort_order: 1,
  max_assignments_per_entity: null,
  default_variable_keys: [],
  created_by: null,
  created_at: "",
  updated_at: "",
  scopes: [],
};

const mockUpdate = jest.fn((p: unknown) => ({ type: "updateScopeType", payload: p }));
jest.mock("@/features/scopes/redux/thunks/scopeTreeMutations", () => ({
  updateScopeType: (p: unknown) => mockUpdate(p),
  deleteScopeType: jest.fn(),
}));
jest.mock("@/features/scopes/redux/thunks/contextItemMutations", () => ({
  createContextItem: jest.fn(),
  updateContextItem: jest.fn(),
  deleteContextItem: jest.fn(),
}));
jest.mock("@/features/scopes/redux/thunks/ensureScopeTypeItems", () => ({ ensureScopeTypeItems: () => ({ type: "noop" }) }));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({ makeSelectScopeType: () => () => SCOPE_TYPE }));
jest.mock("@/features/scopes/redux/selectors/context-items", () => ({ makeSelectItemsForType: () => () => [] }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => async (a: unknown) => ({ ok: true, data: a }),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({}),
}));
jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({
  MatrxDynamicPanelHost: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({ id, value, onChange }: { id: string; value: string; onChange: (e: { target: { value: string } }) => void }) => (
    <textarea id={id} value={value} onChange={(e) => onChange({ target: { value: e.target.value } })} />
  ),
}));
jest.mock("@/components/official/icons/IconInputWithValidation", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/scopes/components/management/ScopeColorPicker", () => ({ ScopeColorPicker: () => null }));
jest.mock("@/features/scopes/components/pages/EditContextItemSheet", () => ({ EditContextItemSheet: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { EditScopeTypeSheet } from "../EditScopeTypeSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function typeInto(el: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

it("shows the type's description and saves the edited one", async () => {
  await act(async () =>
    root.render(<EditScopeTypeSheet open onOpenChange={() => undefined} orgId={SCOPE_TYPE.organization_id} typeId={SCOPE_TYPE.id} />),
  );
  const box = host.querySelector<HTMLTextAreaElement>("textarea[id$='-description']");
  expect(box?.value).toBe("Workers' compensation matters");
  await act(async () => typeInto(box!, "Open workers' compensation matters"));
  const save = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Save changes"))!;
  await act(async () => save.click());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ type_id: SCOPE_TYPE.id, description: "Open workers' compensation matters" }));
});
