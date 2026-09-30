/**
 * A RECORD'S ORGANIZATION ALWAYS COMES FROM THE RECORD. When `custom.where_id_opens` cannot answer,
 * the resolver says so in a sentence ("unavailable") — it never falls back to the organization the
 * person is working in (AO-126, AO-164..167: the stand-in is gone; the door is live).
 */
import { resolveObjectOrganization } from "../objectOrganization";
import * as resolver from "../objectOrganization";

const TABLE = "c1aabdc0-0000-4000-8000-000000000001";
const ITS_ORG = "57f2a22b-5875-46c6-80df-437076421c28";

describe("resolveObjectOrganization", () => {
  it("names the record's own organization when the door answers", async () => {
    const answer = await resolveObjectOrganization(
      { rpc: (async () => ({ data: { kind: "table", organization_id: ITS_ORG, path: null, live: true }, error: null })) as never },
      TABLE,
    );
    expect(answer).toMatchObject({ state: "found", organizationId: ITS_ORG });
  });

  it("an absent door is an honest 'unavailable' with a remedy, never a borrowed organization", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const answer = await resolveObjectOrganization(
      { rpc: (async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })) as never },
      TABLE,
    );
    expect(answer.state).toBe("unavailable");
    expect((answer as { why: string }).why).toMatch(/where_id_opens is missing/);
    expect(JSON.stringify(answer)).not.toMatch(/stand-in|activeOrganizationId/);
    warn.mockRestore();
  });

  it("the stand-in door is closed: no exported way to read the active organization for a record", () => {
    expect((resolver as Record<string, unknown>).standInOrganizationId).toBeUndefined();
  });
});
