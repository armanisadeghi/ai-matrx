/** @jest-environment node */

// A share notification for a content.document opens where its TYPE says: a Space is
// /spaces/<id>, never the generic /documents/<id> guess (that route loads another table).

import { getResourceDetails, type SupabaseServerClient } from "../sharedResourceDetails";

jest.mock("@/lib/organizations/linkCarriesItsOrganization", () => ({
  linkCarriesItsOrganization: async (url: string, organizationId: string) =>
    `${url}${url.includes("?") ? "&" : "?"}org=${organizationId}`,
}));

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function docClient(format: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { title: "Roadmap", format, organization_id: ORG }, error: null }),
  };
  return { schema: () => ({ from: () => chain }) } as unknown as SupabaseServerClient;
}

describe("a shared document's notification link follows the document's type", () => {
  it("a Space opens at /spaces/<id>", async () => {
    const got = await getResourceDetails(docClient("spaces"), "document", ID);
    expect(got?.path).toBe(`/spaces/${ID}?org=${ORG}`);
    expect(got?.url).toBe(`https://www.aimatrx.com/spaces/${ID}?org=${ORG}`);
  });

  it("any other document opens in the Markdown Studio, never /documents/<id>", async () => {
    const got = await getResourceDetails(docClient("markdown"), "document", ID);
    expect(got?.path).toBe(`/markdown-studio?source=document&id=${ID}&org=${ORG}`);
    expect(got?.path).not.toContain("/documents/");
  });
});
