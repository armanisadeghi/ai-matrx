/** @jest-environment node */

/**
 * 🚨 ACCESS LADDER T-40: a share notification for ONE TABLE ROW carries a link that opens for the
 * person it was sent to. Outside the row's organization that is the row's own page,
 * /p/e/record/<id> (the table screen would refuse them); inside it, the row in its table.
 * RED before: the email linked the table screen for everyone and the in-app card had no link at
 * all (the registry has no address for `record`, because a Table is a `record` too).
 */

import { getResourceDetails, type SupabaseServerClient } from "../sharedResourceDetails";

jest.mock("@/lib/organizations/linkCarriesItsOrganization", () => ({
  linkCarriesItsOrganization: async (url: string, organizationId: string) => `${url}?org=${organizationId}`,
}));

const ROW = "11111111-1111-4111-8111-111111111111";
const TABLE = "33333333-3333-4333-8333-333333333333";
const ORG = "22222222-2222-4222-8222-222222222222";
const KERNEL = "44444444-4444-4444-8444-444444444444";

function storeClient(kind: "record" | "table") {
  const rpc = jest.fn(async (fn: string) => {
    if (fn === "where_id_opens") {
      return {
        data:
          kind === "record"
            ? { kind: "record", organization_id: ORG, path: `/data-v2/${TABLE}?record=${ROW}` }
            : { kind: "table", organization_id: ORG, path: `/data-v2/${TABLE}`, resolved_id: TABLE },
        error: null,
      };
    }
    if (fn === "table_kernel_id") return { data: KERNEL, error: null };
    if (fn === "read_records_by_ids") return { data: [{ document: { name: "Appointments" } }], error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
  return { schema: () => ({ rpc }) } as unknown as SupabaseServerClient;
}

const outside = { isMemberOf: async () => false };
const member = { isMemberOf: async () => true };

describe("a shared row's notification opens where its recipient can open it", () => {
  it("someone outside the organization gets the row's own page", async () => {
    const got = await getResourceDetails(storeClient("record"), "record", ROW, outside);
    expect(got).toEqual({
      title: "A row in Appointments",
      url: `https://www.aimatrx.com/p/e/record/${ROW}`,
      path: `/p/e/record/${ROW}`,
    });
  });

  it("a member gets the row in its table", async () => {
    const got = await getResourceDetails(storeClient("record"), "record", ROW, member);
    expect(got?.path).toBe(`/data-v2/${TABLE}?record=${ROW}`);
    expect(got?.url).toBe(`https://www.aimatrx.com/data-v2/${TABLE}?record=${ROW}?org=${ORG}`);
  });

  it("a whole Table never points at a row page, whoever receives it", async () => {
    const got = await getResourceDetails(storeClient("table"), "record", TABLE, outside);
    expect(got?.title).toBe("Appointments");
    expect(got?.path).toBe(`/data-v2/${TABLE}`);
  });
});
