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
    // The point of this test is that the RETRY path does not re-emit the
    // transport failure as a console.error (the universal file transport
    // already captures it as a structured failure; a second emission would
    // double-count it as a system_error).
    //
    // Narrowed 2026-09-17: the size ceiling now resolves through the settings
    // ladder (`features/audio/limits.ts`), and in a unit test with no signed-in
    // organization that read legitimately announces itself on console.error —
    // "the ceiling is NOT being applied" is exactly the scream the knob system
    // owes us, and silencing it would be the silent-failure this whole change
    // exists to end. Those announcements are excluded by name; any OTHER
    // console.error still fails the test.
    const unexpected = error.mock.calls.filter(
      (call) => !String(call[0]).startsWith("[audio/limits]"),
    );
    expect(unexpected).toEqual([]);
  });
});
