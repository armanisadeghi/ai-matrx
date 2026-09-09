/** @jest-environment node */
let organizationId: string | null = null;
let resolved = false;
let available = true;
const listeners = new Set<() => void>();
jest.mock('@/lib/redux/store-singleton', () => ({
  getStoreSingleton: () => available ? {
    getState: () => ({ appContext: { organization_id: organizationId, orgBootstrapResolved: resolved } }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
  } : null,
}));
import { waitForOrganizationAdmission } from './organization-admission';
beforeEach(() => { jest.useFakeTimers(); organizationId = null; resolved = false; available = true; listeners.clear(); });
afterEach(() => { jest.useRealTimers(); });
it('distinguishes an unfinished bootstrap deadline from an authoritative empty selection', async () => {
  const pending = waitForOrganizationAdmission();
  await jest.advanceTimersByTimeAsync(8000);
  await expect(pending).resolves.toBe('timed-out');
  expect(listeners.size).toBe(0);
  resolved = true;
  await expect(waitForOrganizationAdmission()).resolves.toBe('unresolved');
});
it('identifies an unavailable store without pretending the user chose no workspace', async () => {
  available = false;
  await expect(waitForOrganizationAdmission()).resolves.toBe('unavailable');
});
it('admits a real arriving selection and removes deadline and listener', async () => {
  const pending = waitForOrganizationAdmission();
  organizationId = 'selected-org';
  for (const fn of listeners) fn();
  await expect(pending).resolves.toBe('ready');
  expect(listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
