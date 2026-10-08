// Spaces writes name the organization of the page or table being written to, never the active one.
import { writeNewEntityRow } from "../entity-row-add";
import { copyTemplate } from "../../state/templates";

const pageOrg = jest.fn();
jest.mock("../agency-install", () => ({ pageOrganizationId: (id: string) => pageOrg(id) }));
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({}),
  supabase: { schema: () => ({ rpc }), rpc: jest.fn() },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: () => Promise.reject(new Error("the active organization must not be asked")) }));

beforeEach(() => {
  pageOrg.mockReset();
  rpc.mockReset();
});

describe("New row in a built-in module", () => {
  it("sends the page's organization", async () => {
    pageOrg.mockResolvedValue("org-of-page");
    const entityRowWrite = jest.fn().mockResolvedValue({ ok: true, data: { id: "r1" } });
    await writeNewEntityRow({ entityRowWrite }, { token: "task", spaceId: "page-1", titleColumn: "title" });
    expect(pageOrg).toHaveBeenCalledWith("page-1");
    expect(entityRowWrite).toHaveBeenCalledWith({ token: "task", record_id: null, organization_id: "org-of-page", columns: { title: "" } });
  });
  it("refuses to write without a page organization", async () => {
    pageOrg.mockResolvedValue(null);
    const entityRowWrite = jest.fn();
    await expect(writeNewEntityRow({ entityRowWrite }, { token: "task", spaceId: "page-1", titleColumn: null })).rejects.toThrow();
    expect(entityRowWrite).not.toHaveBeenCalled();
  });
});

describe("Use template", () => {
  it("copies into the template page's organization, not the active one", async () => {
    pageOrg.mockResolvedValue("org-of-template");
    rpc.mockResolvedValue({ data: "copy-1", error: null });
    await expect(copyTemplate("tpl-1", "Plan", "some-active-org")).resolves.toBe("copy-1");
    expect(rpc).toHaveBeenCalledWith("space_duplicate", expect.objectContaining({ p_space_id: "tpl-1", p_organization_id: "org-of-template" }));
  });
});
