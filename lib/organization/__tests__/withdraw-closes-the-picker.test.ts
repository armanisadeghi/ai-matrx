/**
 * A layer that asked "Which workspace?" and then closes withdraws its own
 * question — the caller hears "cancelled" (nothing happened) and the picker
 * hears the settle and closes. Before (page-pass 2026-09-27, Feedback window):
 * the picker stayed open over nothing after the window was cancelled.
 */
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
  onOrganizationSelectionSettled,
  registerOrganizationPicker,
  settleOrganizationSelection,
  withdrawOrganizationRequest,
} from "../organization-gate";

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({ appContext: { organization_id: null } }) }),
}));

afterEach(() => {
  registerOrganizationPicker(null);
  settleOrganizationSelection(null);
});

it("withdrawing cancels the request and tells the picker to close", async () => {
  registerOrganizationPicker(() => undefined);
  const closed = jest.fn();
  const off = onOrganizationSelectionSettled(closed);
  const asked = ensureOrganizationContext({ interactive: true });
  withdrawOrganizationRequest();
  const error = await asked.catch((e: unknown) => e);
  expect(isOrganizationSelectionCancelled(error)).toBe(true);
  expect(closed).toHaveBeenCalledWith(null);
  off();
});

it("withdrawing with nothing pending does nothing", () => {
  const closed = jest.fn();
  const off = onOrganizationSelectionSettled(closed);
  withdrawOrganizationRequest();
  expect(closed).not.toHaveBeenCalled();
  off();
});
