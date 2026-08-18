import { logClientError } from "../audioFallbackUpload";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: {},
}));
jest.mock("../transcribeSignedUrl", () => ({
  transcribeSignedUrl: jest.fn(),
}));

describe("logClientError", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({} as Response);
    global.fetch = fetchMock;
  });

  it("does not send a recoverable chunk transport failure to the server logger", async () => {
    await logClientError({
      errorCode: "CHUNK_FAILED",
      errorMessage: "Load failed",
      fileSizeBytes: 20_140,
      chunkIndex: 11,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still sends an actionable chunk failure", async () => {
    await logClientError({
      errorCode: "CHUNK_FAILED",
      errorMessage: "Provider rejected the audio format",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audio/log-error",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
