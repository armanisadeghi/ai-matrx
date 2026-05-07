import {
  __clearRenderableImageUrlCacheForTests,
  resolveRenderableImageUrl,
} from "@/features/files/utils/resolveRenderableImageUrl";

describe("resolveRenderableImageUrl", () => {
  beforeEach(() => {
    __clearRenderableImageUrlCacheForTests();
    jest.useRealTimers();
  });

  it("reuses a cached signed URL until it is close to expiry", async () => {
    const getSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ url: "https://signed.example.com/one", expires_in: 3600 });

    const first = await resolveRenderableImageUrl(
      { fileId: "file-1" },
      { getSignedUrl, now: () => 1_000 },
    );
    const second = await resolveRenderableImageUrl(
      { fileId: "file-1" },
      { getSignedUrl, now: () => 2_000 },
    );

    expect(first.url).toBe("https://signed.example.com/one");
    expect(second.url).toBe("https://signed.example.com/one");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent signed URL requests for the same file", async () => {
    let resolveRequest:
      | ((value: { url: string; expires_in: number }) => void)
      | null = null;
    const getSignedUrl = jest.fn(
      () =>
        new Promise<{ url: string; expires_in: number }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = resolveRenderableImageUrl({ fileId: "file-1" }, { getSignedUrl });
    const second = resolveRenderableImageUrl({ fileId: "file-1" }, { getSignedUrl });
    resolveRequest?.({ url: "https://signed.example.com/shared", expires_in: 3600 });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ url: "https://signed.example.com/shared" }),
      expect.objectContaining({ url: "https://signed.example.com/shared" }),
    ]);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("refreshes a known cloud file URL after expiry", async () => {
    const getSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ url: "https://signed.example.com/fresh", expires_in: 3600 });

    const result = await resolveRenderableImageUrl(
      {
        url: "https://signed.example.com/expired",
        metadata: {
          fileId: "file-1",
          urlExpiresAt: 1_000,
        },
      },
      { getSignedUrl, now: () => 2_000 },
    );

    expect(result.url).toBe("https://signed.example.com/fresh");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("resolves an id-only cloud file record through the signed URL cache", async () => {
    const getSignedUrl = jest
      .fn()
      .mockResolvedValueOnce({ url: "https://signed.example.com/from-record", expires_in: 3600 });

    const result = await resolveRenderableImageUrl(
      {
        id: "file-1",
        publicUrl: null,
      },
      { getSignedUrl, now: () => 1_000 },
    );

    expect(result.url).toBe("https://signed.example.com/from-record");
    expect(getSignedUrl).toHaveBeenCalledWith("file-1", { expiresIn: 3600 });
  });
});
