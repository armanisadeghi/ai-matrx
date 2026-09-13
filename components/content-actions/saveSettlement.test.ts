import {
  requireSettledContentSave,
  type SettledContentSave,
} from "./saveSettlement";
import {
  createFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
} from "@/features/overlays/callbacks/fullScreenEditor";

describe("content action save settlement", () => {
  it("refuses a synchronous callback before an editor wrapper can report success", () => {
    const legacyVoidSave = (() => undefined) as unknown as SettledContentSave;

    expect(() => requireSettledContentSave(legacyVoidSave, "draft")).toThrow(
      "must return a Promise",
    );
  });

  it("preserves a rejected persistence acknowledgement for editor retry", async () => {
    const failedSave = jest.fn(async () => {
      throw new Error("write failed");
    });

    await expect(
      requireSettledContentSave(failedSave, "draft"),
    ).rejects.toThrow("write failed");
    expect(failedSave).toHaveBeenCalledWith("draft");
  });

  it("keeps the callback group for retry when a caller mutation rejects", async () => {
    const mutation = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(undefined);
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: (content) => requireSettledContentSave(mutation, content),
    });

    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).rejects.toThrow(
      "write failed",
    );
    await expect(emitFullScreenEditorSave(callbackGroupId, "draft")).resolves.toBeUndefined();
    expect(mutation).toHaveBeenCalledTimes(2);
  });
});
