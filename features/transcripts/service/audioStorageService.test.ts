import { fileHandler } from "@/features/files/handler/handler";
import { saveAudioToStorage } from "./audioStorageService";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: jest.fn() },
}));

describe("saveAudioToStorage retry capture boundary", () => {
  const upload = fileHandler.upload as jest.MockedFunction<
    typeof fileHandler.upload
  >;

  beforeEach(() => {
    jest.useFakeTimers();
    upload.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("retries a structured transport failure without duplicating console.error", async () => {
    upload
      .mockRejectedValueOnce(new Error("Upload failed — check your connection."))
      .mockResolvedValueOnce({ fileId: "file-123" } as never);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const resultPromise = saveAudioToStorage(
      new Blob([new Uint8Array(128)], { type: "audio/webm" }),
      "user-123",
      undefined,
      2,
    );
    await jest.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toMatchObject({ fileId: "file-123" });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "Upload attempt 1 failed; retrying: Upload failed — check your connection.",
    );
    expect(error).not.toHaveBeenCalled();
  });
});
