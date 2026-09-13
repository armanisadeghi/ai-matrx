import {
  createFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
} from "./fullScreenEditor";

describe("full-screen editor callback settlement", () => {
  it("retains a failed command for retry and removes it only after acknowledgement", async () => {
    const save = jest
      .fn(async (_content: string) => undefined)
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce(undefined);
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: save,
    });

    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).rejects.toThrow("conflict");
    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).resolves.toBeUndefined();
    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).rejects.toThrow("Expected exactly one");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not make an acknowledged write retryable when its observer fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const save = jest.fn(async (_content: string) => undefined);
    const observer = jest
      .fn(async () => undefined)
      .mockRejectedValue(new Error("observer"));
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: save,
      onEvent: observer,
    });

    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[fullScreenEditor] save observer failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("rejects a missing save target", async () => {
    await expect(emitFullScreenEditorSave(null, "draft")).rejects.toThrow("no longer has a save target");
  });
});
