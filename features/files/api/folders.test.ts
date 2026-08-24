import { ensureFolderPath } from "./folders";
import { postJson } from "@/lib/python-client";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  patchJson: jest.fn(),
  postJson: jest.fn(),
}));

const mockedPostJson = postJson as jest.MockedFunction<typeof postJson>;

describe("ensureFolderPath", () => {
  beforeEach(() => mockedPostJson.mockReset());

  it("normalizes the path and delegates the whole chain to one request", async () => {
    mockedPostJson.mockResolvedValue({
      data: { id: "leaf-folder" },
      meta: { requestId: "request-1", status: 200, serverRequestId: null },
    });

    await ensureFolderPath(" /Images// Generated / Chat/ ", "personal", {
      requestId: "request-1",
    });

    expect(mockedPostJson).toHaveBeenCalledTimes(1);
    expect(mockedPostJson).toHaveBeenCalledWith(
      "/folders",
      {
        folder_path: "Images/Generated/Chat",
        visibility: "personal",
        metadata: null,
      },
      { requestId: "request-1" },
    );
  });

  it("rejects an empty logical path without making a request", async () => {
    await expect(ensureFolderPath(" /// ")).rejects.toThrow(
      "folderPath cannot be empty.",
    );
    expect(mockedPostJson).not.toHaveBeenCalled();
  });
});
