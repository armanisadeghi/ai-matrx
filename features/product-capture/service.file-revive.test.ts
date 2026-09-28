/**
 * SUT: product-capture's direct link writer. A removed item↔file relation is
 * the same durable relationship when it is linked again, so the client must
 * target the full key and explicitly clear only its archive marker. The live
 * clone/RLS probe exercises that conflict path; this boundary test prevents a
 * future client edit from silently changing the emitted upsert contract.
 */

const single = jest.fn();
const select = jest.fn(() => ({ single }));
const upsert = jest.fn(() => ({ select }));
const from = jest.fn(() => ({ upsert }));
const schema = jest.fn(() => ({ from }));
const createClient = jest.fn(() => ({ schema }));

jest.mock("@/utils/supabase/client", () => ({ createClient }));

import { linkFile } from "./service";

describe("linkFile archive revival", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    single.mockResolvedValue({
      data: {
        id: "a3a077e0-5c68-44c6-a7fc-0c46eb669301",
        item_id: "b3a077e0-5c68-44c6-a7fc-0c46eb669301",
        file_id: "c3a077e0-5c68-44c6-a7fc-0c46eb669301",
        kind: "photo",
        metadata: {},
        created_at: "2026-09-28T12:00:00.000Z",
      },
      error: null,
    });
  });

  it("revives the same item-file identity instead of making another relation", async () => {
    await linkFile({
      itemId: "b3a077e0-5c68-44c6-a7fc-0c46eb669301",
      organizationId: "d3a077e0-5c68-44c6-a7fc-0c46eb669301",
      fileId: "c3a077e0-5c68-44c6-a7fc-0c46eb669301",
      kind: "photo",
    });

    expect(schema).toHaveBeenCalledWith("workbench");
    expect(from).toHaveBeenCalledWith("product_capture_file");
    expect(upsert).toHaveBeenCalledWith(
      {
        item_id: "b3a077e0-5c68-44c6-a7fc-0c46eb669301",
        organization_id: "d3a077e0-5c68-44c6-a7fc-0c46eb669301",
        file_id: "c3a077e0-5c68-44c6-a7fc-0c46eb669301",
        kind: "photo",
        deleted_at: null,
      },
      { onConflict: "item_id,file_id" },
    );
  });
});
