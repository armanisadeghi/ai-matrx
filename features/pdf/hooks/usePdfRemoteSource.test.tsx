import { renderHook, settle } from "@/test-utils/renderHook";

const mockGetCached = jest.fn();
const mockInvalidate = jest.fn();
const mockUseFileAsset = jest.fn();
const mockEnsureFilesSession = jest.fn();

jest.mock("@/features/files/hooks/blob-cache", () => ({
  getCached: (...args: unknown[]) => mockGetCached(...args),
  invalidate: (...args: unknown[]) => mockInvalidate(...args),
}));

jest.mock("@/features/files/hooks/useFileAsset", () => ({
  useFileAsset: (...args: unknown[]) => mockUseFileAsset(...args),
}));

jest.mock("@/features/files/handler/session", () => ({
  ensureFilesSession: (...args: unknown[]) => mockEnsureFilesSession(...args),
}));

import { usePdfRemoteSource } from "./usePdfRemoteSource";

const FILE_ID = "7e59da76-0548-4f4f-b645-10bb391d48fc";
const DURABLE_URL = `https://files.matrxserver.com/files/${FILE_ID}/download?inline=1`;
const CDN_URL = `https://cdn.matrxserver.com/${FILE_ID}.pdf`;

function assetResult(cdnUrl: string | null) {
  return {
    asset: {
      primary_url: cdnUrl ?? DURABLE_URL,
      variants: {
        original: {
          cdn_url: cdnUrl,
          url: cdnUrl ?? DURABLE_URL,
        },
      },
    },
    isLoading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  };
}

describe("usePdfRemoteSource durable authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCached.mockReturnValue(null);
    mockEnsureFilesSession.mockResolvedValue(undefined);
  });

  it("establishes the file session before exposing a private URL", async () => {
    let finishSession!: () => void;
    mockEnsureFilesSession.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSession = resolve;
      }),
    );
    mockUseFileAsset.mockReturnValue(assetResult(null));

    const hook = await renderHook(() => usePdfRemoteSource(FILE_ID));
    expect(hook.current.remoteUrl).toBeNull();
    expect(hook.current.loading).toBe(true);
    expect(hook.current.withCredentials).toBe(true);
    expect(mockEnsureFilesSession).toHaveBeenCalledWith();

    await hook.act(async () => finishSession());
    await settle(
      hook,
      (value) => value.remoteUrl === DURABLE_URL,
      "private PDF session",
    );
    expect(hook.current.loading).toBe(false);
    await hook.unmount();
  });

  it("keeps public CDN URLs credential-free and immediately available", async () => {
    mockUseFileAsset.mockReturnValue(assetResult(CDN_URL));

    const hook = await renderHook(() => usePdfRemoteSource(FILE_ID));
    expect(hook.current.remoteUrl).toBe(CDN_URL);
    expect(hook.current.loading).toBe(false);
    expect(hook.current.withCredentials).toBe(false);
    expect(mockEnsureFilesSession).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("forces a session refresh before retrying a private URL", async () => {
    mockUseFileAsset.mockReturnValue(assetResult(null));
    const hook = await renderHook(() => usePdfRemoteSource(FILE_ID));
    await settle(
      hook,
      (value) => value.remoteUrl === DURABLE_URL,
      "initial private PDF session",
    );
    mockEnsureFilesSession.mockClear();

    await hook.act(() => hook.current.retry());
    expect(mockInvalidate).toHaveBeenCalledWith(FILE_ID);
    expect(mockEnsureFilesSession).toHaveBeenCalledWith({ force: true });
    await hook.unmount();
  });
});
