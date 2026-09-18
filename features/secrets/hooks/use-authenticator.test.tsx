import { renderHook, settle } from "@/test-utils/renderHook";

const fetchAuthenticators = jest.fn();
let mockSelectorState: {
  appContext: {
    organization_id: string | null;
    orgBootstrapResolved: boolean;
  };
};
const mockSelectorListeners = new Set<() => void>();

jest.mock("@/lib/redux/hooks", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useAppSelector: (selector: (state: typeof mockSelectorState) => unknown) =>
      React.useSyncExternalStore(
        (listener) => {
          mockSelectorListeners.add(listener);
          return () => mockSelectorListeners.delete(listener);
        },
        () => selector(mockSelectorState),
        () => selector(mockSelectorState),
      ),
  };
});

jest.mock("../authenticator-service", () => ({
  deleteAuthenticator: jest.fn(),
  fetchAuthenticators: (...args: unknown[]) => fetchAuthenticators(...args),
  setAuthenticatorEnabled: jest.fn(),
}));

jest.mock("../vault-service", () => ({ updateVaultItem: jest.fn() }));

import { useAuthenticator } from "./use-authenticator";

function setOrganizationContext(
  organizationId: string | null,
  orgBootstrapResolved: boolean,
): void {
  mockSelectorState = {
    appContext: {
      organization_id: organizationId,
      orgBootstrapResolved,
    },
  };
  for (const listener of mockSelectorListeners) listener();
}

describe("useAuthenticator organization lifecycle", () => {
  beforeEach(() => {
    fetchAuthenticators.mockReset();
    fetchAuthenticators.mockResolvedValue([]);
    mockSelectorListeners.clear();
    mockSelectorState = {
      appContext: { organization_id: null, orgBootstrapResolved: false },
    };
  });

  it("waits for active-organization bootstrap and reloads when the organization changes", async () => {
    const hook = await renderHook(() => useAuthenticator());

    expect(fetchAuthenticators).not.toHaveBeenCalled();
    expect(hook.current.loading).toBe(true);

    await hook.act(() => setOrganizationContext("org-one", true));
    await settle(hook, () => fetchAuthenticators.mock.calls.length === 1);
    expect(hook.current.organizationRequired).toBe(false);
    expect(hook.current.error).toBeNull();

    await hook.act(() => setOrganizationContext("org-two", true));
    await settle(hook, () => fetchAuthenticators.mock.calls.length === 2);
    expect(hook.current.loading).toBe(false);

    await hook.unmount();
  });

  // Goes red if the hook ever answers "no organization" with a calm empty list
  // again: an unresolved boot must keep loading and stay silent, and a resolved
  // boot with no organization must hand back a refusal that names the remedy
  // instead of stopping at an empty `entries` (c234e314be, Law 4).
  it("keeps loading and says nothing while organization bootstrap is unresolved", async () => {
    setOrganizationContext(null, false);
    const hook = await renderHook(() => useAuthenticator());

    expect(fetchAuthenticators).not.toHaveBeenCalled();
    expect(hook.current.organizationRequired).toBe(false);
    expect(hook.current.loading).toBe(true);
    expect(hook.current.error).toBeNull();

    await hook.unmount();
  });

  it("refuses with a remedy, not an empty list, once boot resolves with no organization", async () => {
    setOrganizationContext(null, true);
    const hook = await renderHook(() => useAuthenticator());

    expect(fetchAuthenticators).not.toHaveBeenCalled();
    expect(hook.current.organizationRequired).toBe(true);
    expect(hook.current.loading).toBe(false);
    expect(hook.current.entries).toEqual([]);
    // The refusal must name what is missing AND what to do about it — an empty
    // list beside a null error is the silent lie this guards.
    expect(hook.current.error).toEqual(expect.any(String));
    expect(hook.current.error).toMatch(/organization/i);
    expect(hook.current.error).toMatch(/picker|choose|select/i);

    // …and it clears the moment an organization arrives, so the refusal can
    // never stick to a surface that is working.
    await hook.act(() => setOrganizationContext("org-one", true));
    await settle(hook, () => fetchAuthenticators.mock.calls.length === 1);
    expect(hook.current.error).toBeNull();
    expect(hook.current.organizationRequired).toBe(false);

    await hook.unmount();
  });
});
