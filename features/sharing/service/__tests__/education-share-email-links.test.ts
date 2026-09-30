/** @jest-environment node */

import { getResourceDetails, type SupabaseServerClient } from "../sharedResourceDetails";

jest.mock("@/lib/organizations/linkCarriesItsOrganization", () => ({
  linkCarriesItsOrganization: async (url: string, organizationId: string) => `${url}?org=${organizationId}`,
}));

const id = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";

describe("education share notification destinations", () => {
  it.each([
    ["assessment", "assessment", { title: "Cell quiz", organization_id: organizationId }, "/education/quizzes", "Cell quiz"],
    ["study_media", "study_media", { title: "Cell summary", organization_id: organizationId }, "/education/media", "Cell summary"],
    ["fc_set", "fc_set", { name: "Cell cards", organization_id: organizationId }, "/education/flashcards", "Cell cards"],
  ])("names %s and links to its canonical viewer", async (type, table, row, path, title) => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const schema = jest.fn().mockReturnValue({ from });

    const result = await getResourceDetails({ schema } as unknown as SupabaseServerClient, type, id);

    expect(schema).toHaveBeenCalledWith("education");
    expect(from).toHaveBeenCalledWith(table);
    expect(eq).toHaveBeenCalledWith("id", id);
    expect(result).toEqual({
      title,
      url: `https://www.aimatrx.com${path}/${id}?org=${organizationId}`,
    });
  });
});
