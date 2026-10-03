/**
 * THE SCOPE READ SWITCH IS ONE PLATFORM KNOB, ANSWERED FOR THE SIGNED-IN PERSON (lane 9, builder E).
 *
 * SUT: `scopesReadFromStore()` (features/scopes/service/scopesReadKnob.ts) — the one decision every
 * scope screen, picker and the chat lens take before reading.
 * It owns: asking `custom.scope_readers_read_the_store` for THIS person in THEIR active organization,
 * deciding once per page load, refusing a non-answer honestly (old path + a warning), and ignoring the
 * retired build-time env flag.
 * Stubbed (dependencies only): the one knob snapshot read (`ensureEffectiveKnob`, network), the Redux
 * store singleton (who is signed in), the organization boot gate.
 *
 * The breaks this catches:
 *   - the switch reads a build-time env / constant instead of the knob (today's code) → the person
 *     with an override is told "old path";
 *   - the switch resolves without the person or organization → the override is never reached;
 *   - a failed knob read silently picks a path, or decides differently on the next read (a mix).
 */

const CEDAR_RIDGE = "6f1c2a7e-3b84-4d1e-9c55-0a7d2e4b9f10"; // Cedar Ridge Physical Therapy
const DANA = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // a therapist with a personal override
const MARCUS = "b2d7e9a1-58c3-4f60-8e2b-7c1d9a3f6e45"; // a front-desk coordinator, no override

let signedIn: { userId: string | null; organizationId: string | null } = { userId: null, organizationId: null };

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({
      userAuth: { id: signedIn.userId },
      appContext: { organization_id: signedIn.organizationId },
    }),
  }),
}));
jest.mock("@/lib/organizations/orgBootstrapGate", () => ({
  whenOrgBootstrapResolved: jest.fn(async () => undefined),
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ ensureEffectiveKnob: jest.fn() }));

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import * as knob from "@/features/scopes/service/scopesReadKnob";

const ensure = ensureEffectiveKnob as jest.Mock;

/** The database's answer: Dana has a user-rung override ON in Cedar Ridge; nobody else does. */
function theRegisterAnswers(organizationId: string | null, userId: string | null, ref: unknown) {
  const addr = ref as { feature?: string; key?: string };
  if (addr?.feature !== "custom" || addr?.key !== "scope_readers_read_the_store") {
    return Promise.reject(new Error(`unexpected knob ${JSON.stringify(ref)}`));
  }
  return Promise.resolve(organizationId === CEDAR_RIDGE && userId === DANA);
}

const reset = (knob as unknown as { __resetScopesReadDecisionForTests?: () => void }).__resetScopesReadDecisionForTests;

beforeEach(() => {
  reset?.();
  knob.__setScopesReadFromStoreForTests(null);
  ensure.mockReset();
  ensure.mockImplementation(theRegisterAnswers);
  delete process.env.NEXT_PUBLIC_SCOPES_READ_FROM_STORE;
});

it.each([
  ["Dana, who has an override, reads the store", DANA, true],
  ["Marcus, who has none, reads the old tables", MARCUS, false],
])("%s", async (_name, userId, expected) => {
  signedIn = { userId, organizationId: CEDAR_RIDGE };
  await expect(Promise.resolve(knob.scopesReadFromStore())).resolves.toBe(expected);
});

it("asks the platform knob for the signed-in person in their active organization", async () => {
  signedIn = { userId: DANA, organizationId: CEDAR_RIDGE };
  await knob.scopesReadFromStore();
  expect(ensure).toHaveBeenCalledWith(CEDAR_RIDGE, DANA, { feature: "custom", key: "scope_readers_read_the_store" });
});

it("an unresolvable knob takes the old path and says so", async () => {
  signedIn = { userId: DANA, organizationId: CEDAR_RIDGE };
  ensure.mockImplementation(() => Promise.reject(new Error("platform.knob_snapshot could not answer")));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    await expect(Promise.resolve(knob.scopesReadFromStore())).resolves.toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/scope_readers_read_the_store/);
  } finally {
    warn.mockRestore();
  }
});

it("decides once per page load: a later knob change does not switch paths mid-page", async () => {
  signedIn = { userId: DANA, organizationId: CEDAR_RIDGE };
  await expect(Promise.resolve(knob.scopesReadFromStore())).resolves.toBe(true);
  ensure.mockImplementation(() => Promise.resolve(false));
  await expect(Promise.resolve(knob.scopesReadFromStore())).resolves.toBe(true);
  expect(ensure).toHaveBeenCalledTimes(1);
});

it("the retired build-time env flag no longer decides", async () => {
  signedIn = { userId: MARCUS, organizationId: CEDAR_RIDGE };
  process.env.NEXT_PUBLIC_SCOPES_READ_FROM_STORE = "true";
  await expect(Promise.resolve(knob.scopesReadFromStore())).resolves.toBe(false);
  expect(ensure).toHaveBeenCalled();
});
