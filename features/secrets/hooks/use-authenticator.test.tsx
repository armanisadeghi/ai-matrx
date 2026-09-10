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

  it("exposes a resolvable organization-required state without making a request", async () => {
    setOrganizationContext(null, true);
    const hook = await renderHook(() => useAuthenticator());

    expect(fetchAuthenticators).not.toHaveBeenCalled();
    expect(hook.current.organizationRequired).toBe(true);
    expect(hook.current.loading).toBe(false);
    expect(hook.current.error).toBeNull();

    await hook.unmount();
  });
});
