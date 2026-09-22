import { withClaims } from "@/test-utils/supabase-auth";
const getUser = jest.fn();
const single = jest.fn();
const select = jest.fn(() => ({ single }));
const insert = jest.fn(() => ({ select }));
const from = jest.fn(() => ({ insert }));
const schema = jest.fn(() => ({ from }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: withClaims({ getUser }), schema },
}));

import { createDocument } from "../document-service";
import { createWorkbook } from "../workbook-service";

const ORGANIZATION_ID = "1b2c3d4e-5f60-4a71-8b92-0c1d2e3f4a5b";

describe("document and workbook create organization boundary", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    schema.mockReturnValue({ from });
    from.mockReturnValue({ insert });
    insert.mockReturnValue({ select });
    select.mockReturnValue({ single });
  });

  it.each([
    ["document", createDocument],
    ["workbook", createWorkbook],
  ] as const)(
    "refuses missing or malformed %s organization before auth or database I/O",
    async (_name, create) => {
      await expect(
        create({ name: "Untitled", organizationId: "" }),
      ).resolves.toMatchObject({ success: false });
      await expect(
        create({ name: "Untitled", organizationId: "not-a-uuid" }),
      ).resolves.toMatchObject({ success: false });
      expect(getUser).not.toHaveBeenCalled();
      expect(schema).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["document", createDocument, "udt_documents"],
    ["workbook", createWorkbook, "udt_workbooks"],
  ] as const)(
    "persists an explicitly captured %s organization",
    async (_name, create, table) => {
      getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      single.mockResolvedValue({ data: { id: "row-1" }, error: null });

      const result = await create({
        name: "Untitled",
        organizationId: ORGANIZATION_ID,
      });

      expect(result.success).toBe(true);
      expect(schema).toHaveBeenCalledWith("workbench");
      expect(from).toHaveBeenCalledWith(table);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ organization_id: ORGANIZATION_ID }),
      );
    },
  );
});
