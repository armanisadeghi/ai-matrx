jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(),
  },
}));

jest.mock("../shareLinks", () => ({
  getShareCapabilities: jest.fn(),
}));

import { supabase } from "@/utils/supabase/client";
import { getResourceVisibility, makePublic } from "../service";
import { getShareCapabilities } from "../shareLinks";

const mockSchema = jest.mocked(supabase.schema);
const mockGetShareCapabilities = jest.mocked(getShareCapabilities);

describe("getResourceVisibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not query a visibility column when the resource type has no public state", async () => {
    mockGetShareCapabilities.mockResolvedValue({
      supportsPublic: false,
      isLinkShareable: true,
      publicState: null,
    });

    await expect(
      getResourceVisibility(
        "seo_collection_run",
        "c3f6270e-b750-49d0-bcc2-4ea02b39f7b7",
      ),
    ).resolves.toEqual({ isPublic: false });
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it("queries the capability-reported card_visibility column", async () => {
    mockGetShareCapabilities.mockResolvedValue({
      supportsPublic: true,
      isLinkShareable: true,
      publicState: { column: "card_visibility", kind: "enum" },
    });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { card_visibility: "public" },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockSchema.mockReturnValue({ from } as never);

    await expect(
      getResourceVisibility(
        "agent_card",
        "4fb96afb-0ff0-4a01-92e1-531a14872144",
      ),
    ).resolves.toEqual({ isPublic: true });
    expect(select).toHaveBeenCalledWith("card_visibility");
    expect(select).not.toHaveBeenCalledWith("visibility");
  });

  it("refuses unsupported public writes without touching the resource table", async () => {
    mockGetShareCapabilities.mockResolvedValue({
      supportsPublic: false,
      isLinkShareable: true,
      publicState: null,
    });

    await expect(
      makePublic({
        resourceType: "seo_collection_run",
        resourceId: "c3f6270e-b750-49d0-bcc2-4ea02b39f7b7",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Public visibility is not available for this item type.",
    });
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it("writes the capability-reported card_visibility enum column", async () => {
    mockGetShareCapabilities.mockResolvedValue({
      supportsPublic: true,
      isLinkShareable: true,
      publicState: { column: "card_visibility", kind: "enum" },
    });
    const select = jest.fn().mockResolvedValue({
      data: [{ id: "4fb96afb-0ff0-4a01-92e1-531a14872144" }],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    mockSchema.mockReturnValue({ from } as never);

    await expect(
      makePublic({
        resourceType: "agent_card",
        resourceId: "4fb96afb-0ff0-4a01-92e1-531a14872144",
      }),
    ).resolves.toEqual({
      success: true,
      message: "Resource is now public",
    });
    expect(update).toHaveBeenCalledWith({ card_visibility: "public" });
  });
});
