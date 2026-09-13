import { renderHook } from "@/test-utils/renderHook";

const mockDownloadMediaSource = jest.fn();
const mockMediaRefToDownloadSource = jest.fn();
const mockSaveImageFile = jest.fn();
const mockToastError = jest.fn();

jest.mock("../../media-client/download", () => ({
  downloadMediaSource: (...args: unknown[]) => mockDownloadMediaSource(...args),
  mediaRefToDownloadSource: (...args: unknown[]) =>
    mockMediaRefToDownloadSource(...args),
}));

jest.mock("../image/utils/save-image-file", () => ({
  saveImageFile: (...args: unknown[]) => mockSaveImageFile(...args),
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { useVideoActions } from "./useVideoActions";
import type { VideoBlock } from "../types";

const FILE_ID = "cbbfa63b-5617-4982-ad08-e2596b0811cd";
const CDN_URL = `https://cdn.matrxserver.com/conversation/${FILE_ID}/clip.mp4`;

const matrxBlock: VideoBlock = {
  kind: "video",
  origin: "matrx",
  status: "complete",
  progress: null,
  errorMessage: null,
  mimeType: "video/mp4",
  fileName: "conversation-clip.mp4",
  sizeBytes: 4_096,
  base64: null,
  metadata: null,
  fileId: FILE_ID,
  visibility: "public",
  cdnUrl: CDN_URL,
  downloadUrl: `https://files.matrxserver.com/files/${FILE_ID}/download`,
  parentFileId: null,
  derivationKind: "manual_upload",
  width: 1920,
  height: 1080,
  durationMs: 21_000,
  posterUrl: null,
};

const externalBlock: VideoBlock = {
  ...matrxBlock,
  origin: "external",
  externalUrl: "https://media.example/external-clip.mp4",
  sourceLabel: "Example Media",
};

describe("useVideoActions download", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMediaRefToDownloadSource.mockImplementation((ref) =>
      !ref
        ? null
        : typeof ref === "string"
        ? { kind: "external_url", url: ref }
        : { kind: "file_id", fileId: ref.file_id },
    );
    mockDownloadMediaSource.mockResolvedValue(undefined);
  });

  it("downloads Matrx video bytes through the file-id handler instead of the raw CDN URL", async () => {
    const hook = await renderHook(() =>
      useVideoActions({
        block: matrxBlock,
        currentSrc: CDN_URL,
        fileId: FILE_ID,
      }),
    );

    await hook.act(() => hook.current.download());

    expect(mockMediaRefToDownloadSource).toHaveBeenCalledWith({
      file_id: FILE_ID,
    });
    expect(mockDownloadMediaSource).toHaveBeenCalledWith(
      { kind: "file_id", fileId: FILE_ID },
      "conversation-clip.mp4",
    );
    expect(mockSaveImageFile).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("keeps external video downloads on their supplied playback URL", async () => {
    const hook = await renderHook(() =>
      useVideoActions({
        block: externalBlock,
        currentSrc: externalBlock.externalUrl,
        fileId: null,
      }),
    );

    await hook.act(() => hook.current.download());

    expect(mockMediaRefToDownloadSource).toHaveBeenCalledWith(
      externalBlock.externalUrl,
    );
    expect(mockDownloadMediaSource).toHaveBeenCalledWith(
      { kind: "external_url", url: externalBlock.externalUrl },
      "conversation-clip.mp4",
    );
    expect(mockSaveImageFile).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it("keeps the existing unavailable-download error when no source can be resolved", async () => {
    const hook = await renderHook(() =>
      useVideoActions({
        block: externalBlock,
        currentSrc: null,
        fileId: null,
      }),
    );

    await hook.act(() => hook.current.download());

    expect(mockDownloadMediaSource).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("No download URL available");
    await hook.unmount();
  });
});
