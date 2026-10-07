/**
 * P16f: files are part of chat. The private store (a bare host with no Redux of its own)
 * mounts the files engine's `cloudFiles` slice from @ai-matrx/media; given a files host it
 * wires the engine to ITSELF, so a file action lands in the slice chat renders from.
 */
import { upsertFile } from "@ai-matrx/media/files/engine/redux/slice";
import { getStoreSingleton } from "@ai-matrx/media/files/engine/host/store";
import { createChatStore } from "../create-chat-store";

type FilesSlice = { cloudFiles: { filesById: Record<string, { fileName?: string }> } };

describe("the private chat store has files", () => {
  it("mounts the cloudFiles slice from the files engine", () => {
    const store = createChatStore();
    expect((store.getState() as unknown as FilesSlice).cloudFiles.filesById).toEqual({});
  });

  it("wires the files engine to itself and a file action lands in its slice", () => {
    const store = createChatStore(undefined, {
      files: { db: {} as never, server: {} as never },
    });
    expect(getStoreSingleton()).toBe(store);
    store.dispatch(upsertFile({ id: "f-1", fileName: "intake-checklist.txt" }));
    expect(
      (store.getState() as unknown as FilesSlice).cloudFiles.filesById["f-1"]?.fileName,
    ).toBe("intake-checklist.txt");
  });
});
