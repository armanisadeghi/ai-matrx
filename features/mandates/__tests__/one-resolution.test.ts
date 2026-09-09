/**
 * ONE RESOLUTION — the client asks, it never walks the ladder.
 *
 * Ruling (Arman, 2026-09-01): *"We need a SINGLE source of truth that resolves
 * this everywhere so there is never a ui that tells a lie or a server or
 * client-side feature that runs something different than the single system-wide
 * truth."* The ladder is user → the ACTIVE org → system, and D-R2 puts it in
 * exactly one place. These are the browser's half of that contract.
 *
 * ── WHAT THIS REPLACED, AND WHY IT COULD NOT SURVIVE ────────────────────────
 * Two suites used to live here (`holder-type-resolution.test.ts`,
 * `resolve-dead-mandate.test.ts`). Both drove a FAKE `mandate.binding` table
 * through a fake Supabase client, because the resolver they tested walked its
 * own two-rung ladder in the browser. That ladder is deleted, so a double that
 * still served binding rows would be testing a system that no longer exists —
 * the "faithful or false" rule. Their real intents are carried forward below,
 * moved onto the seam that now decides: the server verdict.
 *   - a non-agent Holder must REFUSE, never degrade to the default   → "refuses a workflow verdict"
 *   - a version-pinned winner must REFUSE                            → "refuses a version-pinned verdict"
 *   - a dead / unknown mandate must refuse, optionally as null       → "a mandate the door does not know"
 *
 * ── THE LIVE DEFECT THESE PIN (measured on production, 2026-09-07) ──────────
 * The deleted org query filtered on `principal_type='org'` and named NO
 * organization, so RLS decided the rung. A non-admin fixture belonging to
 * neither the system org nor any org with bindings (`dana.ruiz@example.test`)
 * read all 27 version-pinned system-org `org` bindings straight out of
 * PostgREST. Nothing changed the answer that day — 0 of the 4 applicable rows
 * name a different holder than the definition default — which is exactly why it
 * had to be closed BEFORE somebody edited one and silently repointed every user
 * on the platform at a foreign organization's agent.
 */

// ── The fakes ───────────────────────────────────────────────────────────────
//
// Only two things are faked, and both are real seams with a real contract:
// the org-bound transport (`getJson`) and the active-org admission kernel.
// NOTHING fakes a binding row — there is no binding read left to fake, and a
// double able to serve one could hold a state the shipped code cannot.

const USER_ID = "cccccccc-dddd-4eee-8fff-000000000000";
const ORG_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG_B = "bbbbbbbb-2222-4222-8222-222222222222";
const MANDATE_ID = "0f2a1f1e-1111-4c4c-9c9c-aaaaaaaaaaaa";
const SYSTEM_AGENT = "11111111-2222-4333-8444-555555555555";
const ORG_AGENT = "99999999-8888-4777-8666-555555555555";
const KEY = "test.one_resolution";

interface Verdict {
  mandate_key: string;
  holder_type: string;
  agent_id: string | null;
  is_version: boolean;
  provenance: string;
  config_overrides: Record<string, unknown> | null;
  contract: Record<string, unknown>;
  freshness: string;
  input_kind: string | null;
  output_kind: string | null;
  provision_key: string | null;
  consumption_map: Record<string, unknown> | null;
  auto_run: boolean | null;
}

function verdictFor(overrides: Partial<Verdict> = {}): Verdict {
  return {
    mandate_key: KEY,
    holder_type: "agent",
    agent_id: SYSTEM_AGENT,
    is_version: false,
    provenance: "system",
    config_overrides: null,
    contract: {},
    freshness: "fresh within 5 seconds",
    input_kind: null,
    output_kind: null,
    provision_key: null,
    consumption_map: null,
    auto_run: null,
    ...overrides,
  };
}

/** Per-org verdicts, so "the answer follows the active org" is observable. */
let verdictByOrg: Record<string, Verdict> = {};
let doorStatus: number | null = null;
/** Every org header the transport was asked to bind, in order. */
let doorOrgCalls: string[] = [];

let admission: "ready" | "unresolved" | "timed-out" | "unavailable" = "ready";
let selectedOrg: string | null = ORG_A;

class FakeBackendApiError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}

jest.mock("@/lib/api/errors", () => ({
  BackendApiError: class extends Error {
    status: number;
    constructor(init: { status: number }) {
      super("backend");
      this.status = init.status;
    }
  },
}));

jest.mock("@/lib/python-client", () => ({
  getJson: async (path: string) => {
    const org = selectedOrg ?? "";
    doorOrgCalls.push(org);
    if (doorStatus !== null) {
      const { BackendApiError } = jest.requireMock("@/lib/api/errors") as {
        BackendApiError: new (init: { status: number }) => Error;
      };
      throw new BackendApiError({ status: doorStatus });
    }
    const verdict = verdictByOrg[org];
    if (!verdict) throw new FakeBackendApiError(500);
    if (!path.includes(encodeURIComponent(KEY))) {
      throw new Error(`resolution asked for the wrong path: ${path}`);
    }
    return { data: verdict, meta: { requestId: "r", status: 200, serverRequestId: null } };
  },
}));

jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => admission,
  peekSelectedOrganizationId: () => (admission === "ready" ? selectedOrg : null),
}));

/** Every table the resolver touched, so "reads NO binding rows" is provable. */
let tablesRead: string[] = [];

const MANDATE_ROW = {
  id: MANDATE_ID,
  mandate_key: KEY,
  is_enabled: true,
  default_holder_type: "agent",
  default_holder_id: SYSTEM_AGENT,
  default_holder_version_id: null,
  output_kind: null,
  provision_key: null,
  pins: null,
  pinned_context: null,
};

let definitionRow: Record<string, unknown> | null = MANDATE_ROW;

function makeChain(table: string) {
  tablesRead.push(table);
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({
      data: table === "definition" ? definitionRow : null,
      error: null,
    }),
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({ from: (table: string) => makeChain(table) }),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
  }),
}));

import {
  MandateOrganizationUnresolvedError,
  invalidateMandateCache,
  resolveMandate,
} from "../service";
import { mandateOrgSwitchCacheMiddleware } from "../redux/org-switch-cache-middleware";

async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`Expected an Error rejection, received ${String(error)}`);
  }
  throw new Error("Expected the promise to reject");
}

beforeEach(() => {
  admission = "ready";
  selectedOrg = ORG_A;
  doorStatus = null;
  doorOrgCalls = [];
  tablesRead = [];
  definitionRow = MANDATE_ROW;
  verdictByOrg = {
    [ORG_A]: verdictFor(),
    [ORG_B]: verdictFor({ provenance: "org", agent_id: ORG_AGENT }),
  };
  invalidateMandateCache();
});

// ───────────────────────────────────────────────────────────────────────────
// 1. NO ADMITTED ORG IS ITS OWN ANSWER — never a quiet system default.
// ───────────────────────────────────────────────────────────────────────────

describe("resolveMandate refuses without an admitted organization", () => {
  it("throws by NAME rather than resolving at the system rung", async () => {
    admission = "unresolved";
    selectedOrg = null;

    await expect(resolveMandate(KEY)).rejects.toBeInstanceOf(
      MandateOrganizationUnresolvedError,
    );
    // The whole point: it did not quietly answer. Nothing was asked of the
    // door, so no verdict could have been mistaken for a real one.
    expect(doorOrgCalls).toEqual([]);
  });

  it("says what to do about it, in words a person can act on", async () => {
    admission = "unresolved";
    selectedOrg = null;
    const error = await rejectedError(resolveMandate(KEY));
    expect(error.message).toContain("no organization is selected");
    expect(error.message).toContain("select a workspace");
  });

  it.each(["timed-out", "unavailable"] as const)("preserves %s admission instead of inventing a selection verdict", async (outcome) => {
    admission = outcome;
    selectedOrg = null;
    const error = await rejectedError(resolveMandate(KEY));
    expect(error).toMatchObject({ name: "MandateOrganizationUnresolvedError", admission: outcome });
    expect(error.message).not.toContain("no organization is selected");
    expect(error.message).not.toContain("select a workspace");
    expect(doorOrgCalls).toEqual([]);
  });

  it("refuses the OPTIONAL lane too — optional means unassigned, not un-scoped", async () => {
    admission = "unresolved";
    selectedOrg = null;
    // A missing org is not "this key is deliberately unassigned". Returning
    // null here would let a consumer disable its affordance for a reason that
    // has nothing to do with the mandate.
    await expect(
      resolveMandate(KEY, { optional: true }),
    ).rejects.toBeInstanceOf(MandateOrganizationUnresolvedError);
  });

  it("resolves normally the moment an organization IS admitted", async () => {
    const resolved = await resolveMandate(KEY);
    expect(resolved.agentId).toBe(SYSTEM_AGENT);
    expect(resolved.organizationId).toBe(ORG_A);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. THE CACHE KEY CARRIES THE ORG, AND THE SWITCH DROPS IT.
// ───────────────────────────────────────────────────────────────────────────

describe("the resolution cache is keyed on the organization", () => {
  it("serves a cached answer within one org", async () => {
    await resolveMandate(KEY);
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A]);
  });

  it("does NOT serve org A's verdict to org B", async () => {
    const inA = await resolveMandate(KEY);
    selectedOrg = ORG_B;
    const inB = await resolveMandate(KEY);

    expect(inA.agentId).toBe(SYSTEM_AGENT);
    expect(inA.organizationId).toBe(ORG_A);
    // The defect this pins: with a user+key cache key, this second call
    // returned org A's holder for five minutes after the switch.
    expect(inB.agentId).toBe(ORG_AGENT);
    expect(inB.organizationId).toBe(ORG_B);
    expect(inB.provenance).toBe("org");
    expect(doorOrgCalls).toEqual([ORG_A, ORG_B]);
  });

  it("does not accumulate two live answers when the user toggles back", async () => {
    await resolveMandate(KEY);
    selectedOrg = ORG_B;
    await resolveMandate(KEY);

    // The org switch itself evicts, so coming back re-asks rather than
    // serving whatever was written in the earlier five-minute window.
    dispatchOrgChange(ORG_A);
    selectedOrg = ORG_A;
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A, ORG_B, ORG_A]);
  });
});

// A minimal store harness: the middleware is the unit, so the "store" is just
// the org-carrying slice it reads before and after `next(action)`.
let middlewareState: { appContext: { organization_id: string | null } };
function dispatchOrgChange(nextOrg: string | null): void {
  const api = {
    getState: () => middlewareState,
    dispatch: () => undefined,
  };
  const next = (action: { type: string; payload: { id: string | null } }) => {
    middlewareState = { appContext: { organization_id: action.payload.id } };
    return action;
  };
  mandateOrgSwitchCacheMiddleware(api as never)(next as never)({
    type: "appContext/setOrganization",
    payload: { id: nextOrg },
  });
}

describe("the org-switch action drops cached entries", () => {
  beforeEach(() => {
    middlewareState = { appContext: { organization_id: ORG_A } };
  });

  it("evicts when the organization actually changes", async () => {
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A]);

    dispatchOrgChange(ORG_B);
    selectedOrg = ORG_B;
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A, ORG_B]);
  });

  it("does NOT evict when the same organization is re-dispatched", async () => {
    // Rehydration and cross-tab broadcast re-dispatch the current org. Evicting
    // on those would re-ask the door for every mounted mandate on every tab
    // focus — a cost with no correctness behind it.
    await resolveMandate(KEY);
    dispatchOrgChange(ORG_A);
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A]);
  });

  it("evicts on sign-out (organization becomes null)", async () => {
    await resolveMandate(KEY);
    dispatchOrgChange(null);
    // The next signed-in user must never be served the previous one's verdict
    // out of a module-level Map.
    selectedOrg = ORG_A;
    await resolveMandate(KEY);
    expect(doorOrgCalls).toEqual([ORG_A, ORG_A]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. THE CLIENT NEVER WALKS A RUNG — the runtime half of the ESLint guard.
// ───────────────────────────────────────────────────────────────────────────

describe("resolution reads no binding rows", () => {
  it("touches the definition and treatment tables and nothing else", async () => {
    await resolveMandate(KEY);
    expect(tablesRead).toEqual(["definition", "treatment"]);
    expect(tablesRead).not.toContain("binding");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. THE VERDICT GATE — carried over from the deleted holder-type suite.
// ───────────────────────────────────────────────────────────────────────────

describe("a verdict this client cannot run REFUSES, loudly", () => {
  it("refuses a workflow verdict instead of degrading to the default", async () => {
    verdictByOrg[ORG_A] = verdictFor({
      holder_type: "workflow",
      agent_id: null,
      provenance: "user",
    });
    const error = await rejectedError(resolveMandate(KEY));
    expect(error.message).toContain("workflow");
    // It names the RUNG, so the person knows which row to fix.
    expect(error.message).toContain("user rung");
    // And it never quietly hands back the system agent.
    expect(error.message).not.toContain(SYSTEM_AGENT);
  });

  // 🚨 FIX-R6 F2, the frontend sibling. This refusal is NOT a developer log: it
  // is `useMandate().error`, printed verbatim on screen by ChatNewClient,
  // EducationTutorClient, ConductorPanel and every other consumer. It used to
  // read "(version 8f9326a3-fc3f-438b-b742-b9ed28f363d7)" — a uuid at a person,
  // the exact string the second walk read on production. The reader cannot act
  // on it; what they CAN act on is the rung and the remedy, both of which the
  // sentence already carries. The pinned id stays available to a developer
  // through the console, never through the sentence.
  it("refuses a version-pinned verdict, names the rung, and prints no uuid", async () => {
    verdictByOrg[ORG_A] = verdictFor({
      is_version: true,
      agent_id: "8f9326a3-fc3f-438b-b742-b9ed28f363d7",
      provenance: "org",
    });
    const error = await rejectedError(resolveMandate(KEY));
    expect(error.message).toContain("org rung is version-pinned");
    // The remedy, in the rung vocabulary — what the person is to DO.
    expect(error.message).toContain("Unpin the org rung");
    expect(error.message).not.toContain("8f9326a3-fc3f-438b-b742-b9ed28f363d7");
    expect(error.message).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // …and never the word the fallback must not become.
    expect(error.message.toLowerCase()).not.toContain("unknown");
  });

  it("carries the winning rung through, without relabelling global as system", async () => {
    verdictByOrg[ORG_A] = verdictFor({ provenance: "global" });
    const resolved = await resolveMandate(KEY);
    expect(resolved.provenance).toBe("global");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A MANDATE THE DOOR DOES NOT KNOW — carried over from the dead-mandate suite.
// ───────────────────────────────────────────────────────────────────────────

describe("a mandate the resolution door does not know", () => {
  it("returns null on the optional lane", async () => {
    doorStatus = 404;
    await expect(resolveMandate(KEY, { optional: true })).resolves.toBeNull();
  });

  it("refuses on the required lane", async () => {
    doorStatus = 404;
    await expect(resolveMandate(KEY)).rejects.toBeTruthy();
  });

  it("re-throws anything that is NOT a 404 — a broken door is not an absent job", async () => {
    doorStatus = 503;
    await expect(
      resolveMandate(KEY, { optional: true }),
    ).rejects.toBeTruthy();
  });

  /**
   * THE CLASS BEHIND ARMAN'S "this mandate does not exist" (2026-08-31): an
   * affordance renders as if it works and the run door 404s. The three dead
   * states — soft-deleted, DISABLED, HOLDERLESS — are now judged in ONE place,
   * by `resolve_mandate`, which is the whole point of the ruling: the browser
   * must not hold a second opinion about whether a job can run. What the
   * browser still owes is that it PROPAGATES the refusal instead of falling
   * back, on both lanes.
   */
  it("propagates a server refusal on a dead definition — never a fallback", async () => {
    doorStatus = 422; // resolve_mandate's refusal for a disabled/holderless job
    await expect(resolveMandate(KEY)).rejects.toBeTruthy();
    await expect(
      resolveMandate(KEY, { optional: true }),
    ).rejects.toBeTruthy();
  });

  it("refuses when the door answers but the definition row is gone", async () => {
    // A verdict for a job whose row was soft-deleted between the two reads:
    // the identity half must not invent a mandate id.
    definitionRow = null;
    await expect(resolveMandate(KEY)).rejects.toBeTruthy();
    await expect(resolveMandate(KEY, { optional: true })).resolves.toBeNull();
  });
});
