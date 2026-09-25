/**
 * Shared fixtures for the ORG-GATE-AUDIT regression tests
 * (`*.organization-context.test.ts`, run by `pnpm check:organization-context`).
 *
 * Each of those tests proves the same two things about one feature client, in
 * the shape of `features/scheduling/service/schedulerClient.organization-context.test.ts`:
 *
 *   1. a WRITE the person pressed with no organization selected OPENS the
 *      picker, and the SAME call continues to the network stamped with the
 *      chosen organization — it fails on the pre-fix file, which read the bare
 *      kernel and threw `organization_context_required` without asking;
 *   2. a background READ never opens the picker (fail-closed, before any
 *      networking), so the fix never raises a dialog with nothing behind it.
 *
 * The store mock must answer in the gate's own read shape
 * (`state.appContext.organization_id`), or every case silently takes the
 * no-organization branch.
 */
import {
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";

/** The organization the person picks in the dialog. */
export const CHOSEN_ORG = "33333333-3333-4333-8333-333333333333";
/** An organization that was already selected / already on the record. */
export const SELECTED_ORG = "11111111-1111-4111-8111-111111111111";

export function selectOrganization(
  getState: jest.Mock,
  organizationId: string | null,
): void {
  getState.mockReturnValue({ appContext: { organization_id: organizationId } });
}

/** Mount a picker that answers `organizationId` the way the dialog's Continue does. */
export function mountPickerAnswering(organizationId: string | null): jest.Mock {
  const opened = jest.fn();
  registerOrganizationPicker(() => {
    opened();
    queueMicrotask(() => settleOrganizationSelection(organizationId));
  });
  return opened;
}

export function resetGate(): void {
  registerOrganizationPicker(null);
  settleOrganizationSelection(null);
}

export function mockFetchJson(body: unknown = {}, status = 200): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function organizationHeaderOf(fetchMock: jest.Mock, call = 0): string | null {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return new Headers(init.headers).get("X-Organization-Id");
}
