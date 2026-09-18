/**
 * THE "+" THAT SAID "Select an organization before sending this request."
 * (2026-09-14). The three new-note entry points used to demand the active
 * organization on the click; on a fresh sign-in it is still resolving, and a
 * user with several memberships and no default has none until the auto-select
 * layer names one. This resolver waits for the SELECTION to exist and refuses
 * only when nothing can be named.
 */
import { resolveNewNoteOrganization } from "./useNewNoteOrganization";
import { OrganizationContextError } from "@/lib/api/organization-context";

type Listener = () => void;

function fakeStore(initial: Record<string, unknown>) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: Record<string, unknown>) {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const PERSONAL = "22222222-2222-4222-8222-222222222222";

function stateWith(overrides: {
  organization_id?: string | null;
  orgBootstrapResolved?: boolean;
  personal?: string | null;
  memberships?: string[];
  defaultOrganizationId?: string | null;
}) {
  const memberships = overrides.memberships ?? [];
  return {
    appContext: {
      organization_id: overrides.organization_id ?? null,
      organization_name: null,
      personal_organization_id: overrides.personal ?? null,
      orgBootstrapResolved: overrides.orgBootstrapResolved ?? false,
    },
    scopesTree: {
      organizationIds: memberships,
      organizations: Object.fromEntries(memberships.map((id) => [id, { id, name: id }])),
    },
    userPreferences: {
      organization: { defaultOrganizationId: overrides.defaultOrganizationId ?? null },
    },
  };
}

describe("resolveNewNoteOrganization", () => {
  it("returns the active organization at once when one is set", async () => {
    const store = fakeStore(stateWith({ organization_id: ORG, orgBootstrapResolved: true }));
    await expect(resolveNewNoteOrganization(store, { timeoutMs: 100 })).resolves.toBe(ORG);
  });

  it("WAITS for boot to name the organization instead of refusing the click", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: false }));
    const pending = resolveNewNoteOrganization(store, { timeoutMs: 2_000 });
    setTimeout(() => store.set(stateWith({ organization_id: ORG, orgBootstrapResolved: true })), 30);
    await expect(pending).resolves.toBe(ORG);
  });

  it("SELECTS the nameable organization itself when boot settled empty (the multi-org, no-default user)", async () => {
    const store = fakeStore(
      stateWith({ orgBootstrapResolved: true, personal: PERSONAL, memberships: [PERSONAL, ORG] }),
    );
    const dispatched: unknown[] = [];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const withDispatch = {
      ...store,
      dispatch: (action: unknown) => {
        dispatched.push(action);
        // The thunk would set the org; emulate the reducer.
        store.set(
          stateWith({
            organization_id: PERSONAL,
            orgBootstrapResolved: true,
            personal: PERSONAL,
            memberships: [PERSONAL, ORG],
          }),
        );
        return action;
      },
    };
    const started = Date.now();
    await expect(resolveNewNoteOrganization(withDispatch, { timeoutMs: 8_000 })).resolves.toBe(PERSONAL);
    expect(dispatched).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1_000);
    warn.mockRestore();
  });

  it("does not spin: a store that changes every millisecond costs at most ~20 looks per second", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: false }));
    let looks = 0;
    const counting = {
      ...store,
      getState: () => {
        looks += 1;
        return store.getState();
      },
    };
    const ticker = setInterval(() => store.set(stateWith({ orgBootstrapResolved: false })), 1);
    try {
      await resolveNewNoteOrganization(counting, { timeoutMs: 500 }).catch(() => undefined);
    } finally {
      clearInterval(ticker);
    }
    expect(looks).toBeLessThan(40);
  });

  it("refuses with the organization-required error when boot settled and nothing can be named", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: true, memberships: [] }));
    await expect(resolveNewNoteOrganization(store, { timeoutMs: 2_000 })).rejects.toBeInstanceOf(
      OrganizationContextError,
    );
  });

  it("refuses with the organization-required error when the wait runs out", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: false }));
    const error = await resolveNewNoteOrganization(store, { timeoutMs: 60 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrganizationContextError);
    expect((error as OrganizationContextError).message).toContain("still loading");
  });
});
