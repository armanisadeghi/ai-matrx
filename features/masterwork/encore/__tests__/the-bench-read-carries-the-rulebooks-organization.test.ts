/**
 * THE BENCH-PROOF READ IS ABOUT ONE EXISTING RULEBOOK, SO IT CARRIES THAT RULEBOOK'S OWN ORGANIZATION
 * (active-org law, rule 3; AO-198) — `scopeOverrides.organization_id` on the shared transport — and
 * carries none of its own when the caller does not know one (a read is never held for an org).
 */
const dispatch = jest.fn(async () => ({ error: { status: 403, message: "no" } }));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => ({ dispatch }) }));
const callApi = jest.fn((config: unknown) => config);
jest.mock("@/lib/api/call-api", () => ({ callApi: (c: unknown) => callApi(c) }));

import { getBenchProof } from "../benchProof";

const RULEBOOK = "11111111-1111-4111-8111-111111111111";
const ITS_ORG = "57f2a22b-5875-46c6-80df-437076421c28";

beforeEach(() => callApi.mockClear());

describe("getBenchProof organization", () => {
  it("names the Rulebook's own organization on the call", async () => {
    await getBenchProof(RULEBOOK, ITS_ORG);
    expect(callApi.mock.calls[0]?.[0]).toMatchObject({ scopeOverrides: { organization_id: ITS_ORG } });
  });

  it("names none when the Rulebook's organization is not known", async () => {
    await getBenchProof(RULEBOOK);
    expect(callApi.mock.calls[0]?.[0]).not.toHaveProperty("scopeOverrides");
  });
});
