import { fileHandler } from "@/features/files/handler/handler";
import { loadAiResultBlob } from "./load-ai-result-blob";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: {
    use: jest.fn(),
  },
}));

const mockedUse = jest.mocked(fileHandler.use);
const fetchMock = jest.fn();

describe("loadAiResultBlob", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
  });

  it("downloads an owned AI result through the authenticated file handler", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const as = jest.fn().mockResolvedValue(blob);
    mockedUse.mockReturnValue(
      { as } as unknown as ReturnType<typeof fileHandler.use>,
    );
    await expect(
      loadAiResultBlob({
        fileId: "owned-result-id",
        url: "https://files.example/files/owned-result-id/download?inline=1",
      }),
    ).resolves.toBe(blob);

    expect(mockedUse).toHaveBeenCalledWith({
      kind: "file_id",
      fileId: "owned-result-id",
    });
    expect(as).toHaveBeenCalledWith({ kind: "blob" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a URL-only result when the operation has no owned file id", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    fetchMock.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(blob),
    });

    await expect(
      loadAiResultBlob({ url: "https://provider.example/result.png" }),
    ).resolves.toEqual(blob);

    expect(mockedUse).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/result.png",
      { mode: "cors" },
    );
  });
});
