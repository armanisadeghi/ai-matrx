// features/hr/shared/__tests__/employer-resolution-never-swaps-silently.test.tsx
//
// The laws at the top of `useHrContext.ts`, held down by tests because each is one
// careless edit away from disappearing (Arman, 2026-09-30: lists span employers, the
// active organization is never the employer, HR never uses `?org=`):
//
//   A. An explicit `?org_filter=` resolves FIRST and is honored — module ON or OFF. A
//      module-off employer must open its own enable-door (SPEC-UI-IA §6, R-L1 §D),
//      never a swap into a different employer.
//   B. When the employer that OPENS is not the one that was asked for, the context
//      reports a `substitution` so the shell can say so. The rescue that fixed a real
//      admin lockout stays; the silence does not.
//   C. With no filter and several employers the scope is ALL ORGANIZATIONS — `active`
//      is null (never a silent pick), every employer is in `scope`, and the ACTIVE
//      ORGANIZATION IS NEVER ASKED.

import { renderHook, settle } from "@/test-utils/renderHook";

const mockFetchHrContext = jest.fn();
const mockSearchParams = new Map<string, string>();
/** Set to prove the active organization is never read: resolution must not change with it. */
let mockActiveOrgId: string | null = null;

jest.mock("../../service", () => ({
  fetchHrContext: (...args: unknown[]) => mockFetchHrContext(...args),
  validateHrBrowserSession: async () => ({ ok: true }),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => mockSearchParams.get(k) ?? null }),
}));

import { useHrContextResolver } from "../useHrContext";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const EMPLOYER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function employer(
  id: string,
  name: string,
  slug: string,
  moduleEnabled: boolean,
) {
  return {
    organization_id: id,
    name,
    slug,
    module_enabled: moduleEnabled,
    is_activated: moduleEnabled,
    org_role: "owner",
    persona: "hr_admin",
  };
}

const EMPLOYERS = [
  employer(WORKSPACE, "Priya's Workspace", "priya", false),
  employer(EMPLOYER, "Castellano & Reyes, LLP", "castellano-reyes", true),
];

/** `hr_my_context(orgId)` as the real RPC behaves: it answers for what it was asked. */
function serverAnswering(employers = EMPLOYERS) {
  return async (askedFor: string | null) => {
    const match = employers.find((e) => e.organization_id === askedFor) ?? null;
    return {
      ok: true as const,
      data: {
        employers,
        active: match
          ? {
              organization_id: match.organization_id,
              module_enabled: match.module_enabled,
              is_activated: match.is_activated,
              org_role: match.org_role,
              persona: match.persona,
              capabilities: match.module_enabled ? ["hr.people.read"] : [],
            }
          : null,
        as_of: "2026-08-28",
      },
    };
  };
}

beforeEach(() => {
  mockSearchParams.clear();
  mockActiveOrgId = null;
  mockFetchHrContext.mockReset();
  mockFetchHrContext.mockImplementation(serverAnswering());
});

async function resolve() {
  const handle = await renderHook(() => useHrContextResolver());
  await settle(handle, (v) => !v.isLoading, "the employer context to resolve");
  return handle;
}

describe("law A — an explicit ?org_filter= is the answer, not a suggestion", () => {
  it("opens exactly the employer the URL names when HR is on there (unchanged)", async () => {
    mockSearchParams.set("org_filter", "castellano-reyes");
    mockActiveOrgId = WORKSPACE;

    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(EMPLOYER);
    // The filter is uuid-shaped in every link built from it.
    expect(context.current.orgRef).toBe(EMPLOYER);
    // Silent, as today: nothing was overridden.
    expect(context.current.substitution).toBeNull();
    expect(context.current.scope.mode).toBe("one");
  });

  it("opens a MODULE-OFF employer the URL names, so the enable-door can render", async () => {
    mockSearchParams.set("org_filter", WORKSPACE);
    mockActiveOrgId = EMPLOYER;

    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(WORKSPACE);
    expect(context.current.active?.module_enabled).toBe(false);
    // It was honored, so there is nothing to announce.
    expect(context.current.substitution).toBeNull();
  });
});

describe("law B — the rescue survives, the silence does not", () => {
  it("opens the one employer that has HR on, whatever the active organization is", async () => {
    mockActiveOrgId = WORKSPACE; // the original lockout case — and now irrelevant

    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(EMPLOYER);
    expect(context.current.capabilities).toContain("hr.people.read");
    // Nothing was asked for, so nothing was overridden.
    expect(context.current.substitution).toBeNull();
  });

  it("says so when the URL named an employer this person cannot do HR in", async () => {
    mockSearchParams.set("org_filter", OTHER);

    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(EMPLOYER);
    expect(context.current.substitution).toMatchObject({
      reason: "unavailable",
      askedName: null,
      askedRef: null,
      openedName: "Castellano & Reyes, LLP",
    });
  });

  it("stays silent when nothing was asked for and one employer has HR on", async () => {
    // SPEC-UI-IA rule 3: exactly one HR-reachable employer resolves SILENTLY.
    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(EMPLOYER);
    expect(context.current.substitution).toBeNull();
  });
});

describe("law C — All organizations, and the active organization is never asked", () => {
  const TWO_EMPLOYERS = [
    employer(EMPLOYER, "Castellano & Reyes, LLP", "castellano-reyes", true),
    employer(OTHER, "Oak Street Studio", "oak-street-studio", true),
  ];

  beforeEach(() => {
    mockFetchHrContext.mockImplementation(serverAnswering(TWO_EMPLOYERS));
  });

  it("opens on All organizations: no employer is picked, every one is in scope", async () => {
    mockActiveOrgId = EMPLOYER; // must not matter

    const context = await resolve();

    expect(context.current.active).toBeNull();
    expect(context.current.scope.mode).toBe("all");
    expect(context.current.scope.employers.map((e) => e.organization_id).sort()).toEqual(
      [EMPLOYER, OTHER].sort(),
    );
    // The nav reads the union of what this person may do in those employers.
    expect(context.current.capabilities).toContain("hr.people.read");
    expect(context.current.orgRef).toBeNull();
    expect(context.current.substitution).toBeNull();
  });

  it("never asks the server about the active organization", async () => {
    mockActiveOrgId = OTHER;

    await resolve();

    const asked = mockFetchHrContext.mock.calls.map((c) => c[0]);
    // The first ask is for everything (null); the rest are each employer's own context.
    expect(asked[0]).toBeNull();
    expect(asked.filter((a) => a === OTHER)).toHaveLength(1);
  });

  it("narrows to one employer when the filter names one", async () => {
    mockSearchParams.set("org_filter", OTHER);
    mockActiveOrgId = EMPLOYER;

    const context = await resolve();

    expect(context.current.active?.organization_id).toBe(OTHER);
    expect(context.current.scope.mode).toBe("one");
    expect(context.current.scope.employers.map((e) => e.organization_id)).toEqual([OTHER]);
  });
});
