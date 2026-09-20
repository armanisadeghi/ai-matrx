/**
 * THE "+" THAT SAID "Select an organization before sending this request."
 * (2026-09-14). The three new-note entry points used to demand the active
 * organization on the click; on a fresh sign-in it is still resolving, so the
 * "+" answered with a sentence written for a programmer and looked like an
 * auth failure. The resolver waits for the SELECTION to exist instead.
 *
 * 🚨 WHAT IT USED TO DO BETWEEN "WAIT" AND "REFUSE", AND WHY THAT IS NOW THE
 * FAILURE MODE (Arman, 2026-09-19).
 * ---------------------------------------------------------------------------
 * Once boot had settled with nothing selected, this resolver applied a rung
 * order of its own — stated default-org preference, then the person's own
 * personal workspace — dispatched `chooseActiveOrganization` for whatever it
 * could name, and filed the note there. The case below was called
 *
 *   "SELECTS the nameable organization itself when boot settled empty
 *    (the multi-org, no-default user)"
 *
 * and it asserted exactly that: one dispatch, resolving to the PERSONAL org,
 * for a person who belongs to several organizations and never said which one
 * they work in. That is the thing the ruling forbids. A "default organization"
 * is at most a per-client DISPLAY preference that only the org picker may
 * read, and nothing may pick an organization for a person from a preference or
 * from their personal workspace:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * So boot settling empty no longer means "name one" — it means ASK. The
 * resolver returns `ensureOrganizationContext()`: the ONE gate holds the
 * click, the picker opens, the person SETS an organization (which becomes the
 * active organization globally), and the note is created in it. Cancelling
 * throws `OrganizationSelectionCancelled`, which every caller treats as
 * "nothing happened" — no note, no toast, no lost title.
 *
 * THE ANTI-REGRESSION HALF. Every case that reaches the settled-empty branch
 * runs against a store whose `dispatch` RECORDS, and asserts the record is
 * empty. A restored rung has to dispatch to take effect, so the rung coming
 * back fails this file even if the gate is also called.
 */
import { resolveNewNoteOrganization } from "./useNewNoteOrganization";
import { OrganizationContextError } from "@/lib/api/organization-context";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

const ensureOrganizationContext = jest.fn<Promise<string>, [unknown?]>();
jest.mock("@/lib/organization/organization-gate", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...(jest.requireActual("@/lib/organization/organization-gate") as object),
  ensureOrganizationContext: (options?: unknown) =>
    ensureOrganizationContext(options),
}));

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
const CHOSEN = "33333333-3333-4333-8333-333333333333";

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

/**
 * The exact person the deleted rungs existed for: several memberships, one of
 * them their own personal workspace, a stated default sitting right there in
 * `userPreferences` — and boot settled with nothing selected. Every rung that
 * was deleted had everything it needed in this state.
 */
function theMultiOrgNoSelectionStore() {
  const store = fakeStore(
    stateWith({
      orgBootstrapResolved: true,
      personal: PERSONAL,
      memberships: [PERSONAL, ORG],
      defaultOrganizationId: ORG,
    }),
  );
  const dispatched: unknown[] = [];
  return {
    dispatched,
    store: {
      ...store,
      dispatch: (action: unknown) => {
        dispatched.push(action);
        return action;
      },
    },
  };
}

beforeEach(() => {
  ensureOrganizationContext.mockReset();
});

describe("resolveNewNoteOrganization", () => {
  it("returns the active organization at once when one is set", async () => {
    const store = fakeStore(stateWith({ organization_id: ORG, orgBootstrapResolved: true }));
    await expect(resolveNewNoteOrganization(store, { timeoutMs: 100 })).resolves.toBe(ORG);
    expect(ensureOrganizationContext).not.toHaveBeenCalled();
  });

  it("WAITS for boot to name the organization instead of refusing the click", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: false }));
    const pending = resolveNewNoteOrganization(store, { timeoutMs: 2_000 });
    setTimeout(() => store.set(stateWith({ organization_id: ORG, orgBootstrapResolved: true })), 30);
    await expect(pending).resolves.toBe(ORG);
    expect(ensureOrganizationContext).not.toHaveBeenCalled();
  });

  it("ASKS when boot settled empty, and files the note in the organization the PERSON sets", async () => {
    // This case asserted the opposite until 2026-09-19: one silent dispatch and
    // the PERSONAL org as the answer. Now the held click goes through the ONE
    // gate, and the note lands in whatever the person chose in the picker —
    // never the stated default (ORG) and never their personal workspace
    // (PERSONAL), both of which are present in this state.
    const { store, dispatched } = theMultiOrgNoSelectionStore();
    ensureOrganizationContext.mockResolvedValue(CHOSEN);

    const started = Date.now();
    await expect(resolveNewNoteOrganization(store, { timeoutMs: 8_000 })).resolves.toBe(
      CHOSEN,
    );

    expect(ensureOrganizationContext).toHaveBeenCalledTimes(1);
    expect(dispatched).toEqual([]);
    // It asks immediately — the settled state is an answer, not something to
    // keep waiting out.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("a CANCELLED pick rejects as cancelled and changes nothing at all", async () => {
    const { store, dispatched } = theMultiOrgNoSelectionStore();
    ensureOrganizationContext.mockRejectedValue(new OrganizationSelectionCancelled());

    await expect(
      resolveNewNoteOrganization(store, { timeoutMs: 8_000 }),
    ).rejects.toBeInstanceOf(OrganizationSelectionCancelled);

    // "Not now" is an answer. Nothing was selected on the person's behalf to
    // make the note possible anyway.
    expect(dispatched).toEqual([]);
  });

  it("NEVER dispatches a selection of its own — not a default, not the personal org, not anything", async () => {
    // THE GUARD FOR THE DELETED RUNGS. A restored rung must dispatch
    // `chooseActiveOrganization` to have any effect, so this fails the moment
    // one grows back — even if the gate is still called afterwards.
    const { store, dispatched } = theMultiOrgNoSelectionStore();
    ensureOrganizationContext.mockResolvedValue(CHOSEN);

    await resolveNewNoteOrganization(store, { timeoutMs: 8_000 });

    expect(dispatched).toEqual([]);
    // And nothing was written into the store behind the gate's back: the active
    // organization is still unset from this resolver's point of view.
    expect(
      (store.getState() as ReturnType<typeof stateWith>).appContext.organization_id,
    ).toBeNull();
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

  it("when the gate cannot ASK at all, the fail-closed error still comes through", async () => {
    // No picker mounted, no window: `ensureOrganizationContext` re-throws the
    // original `OrganizationContextError` rather than guessing. Asking is a
    // better refusal, never a weaker one.
    const store = fakeStore(stateWith({ orgBootstrapResolved: true, memberships: [] }));
    ensureOrganizationContext.mockRejectedValue(
      new OrganizationContextError(
        "organization_context_required",
        "Select an organization before sending this request.",
      ),
    );
    await expect(resolveNewNoteOrganization(store, { timeoutMs: 2_000 })).rejects.toBeInstanceOf(
      OrganizationContextError,
    );
  });

  it("refuses with the organization-required error when the wait runs out", async () => {
    const store = fakeStore(stateWith({ orgBootstrapResolved: false }));
    const error = await resolveNewNoteOrganization(store, { timeoutMs: 60 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrganizationContextError);
    expect((error as OrganizationContextError).message).toContain("still loading");
    expect(ensureOrganizationContext).not.toHaveBeenCalled();
  });
});
