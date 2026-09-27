/**
 * THE USE CASE (lane HANDOVER, 2026-09-27). test@test.com, a member of Cedar Ridge Physical
 * Therapy who may view but not edit its patients, changed Dana Whitfield's Allergies. The store
 * refused ("You can see this record, but "Allergies" is not yours to change.") and the page said only
 * "Failed to save": a rejected Redux thunk throws a plain object, not an Error, and the hook read
 * `err instanceof Error ? err.message : "Failed to save"`. RED before the lane.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() } }));
const REFUSAL = { name: "Error", message: 'You can see this record, but "Allergies" is not yours to change.' };
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.reject(REFUSAL) }),
}));
jest.mock("@/features/scopes/redux/scopeContextView", () => ({ setScopeContextValue: () => ({}) }));

const HOOK_UNDER_TEST = process.env.SCOPE_AUTOSAVE_UNDER_TEST ?? "../useScopeAutoSave";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useScopeAutoSave } = require(HOOK_UNDER_TEST) as typeof import("../useScopeAutoSave");

it("says the store's words when a value is refused", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let commit: ((v: unknown) => Promise<void>) | null = null;
  function Probe() {
    commit = useScopeAutoSave("scope-1", "item-1", "string", "Latex, penicillin").commit;
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => {
    await commit!("Latex, penicillin, sulfa");
  });
  const said = JSON.stringify(toastError.mock.calls);
  expect(said).toContain("is not yours to change");
  await act(async () => root.unmount());
});
