/**
 * P16f: files are part of chat. The private store (a bare host with no Redux of its own)
 * mounts the files engine's `cloudFiles` slice from @ai-matrx/media, and a file action
 * dispatched into it lands in that slice — no host registration involved.
 */
import { createChatStore } from "../create-chat-store";

describe("the private chat store has files", () => {
  it("mounts the cloudFiles slice from the files engine", () => {
    const store = createChatStore();
    const files = (store.getState() as unknown as { cloudFiles?: { filesById?: unknown } })
      .cloudFiles;
    expect(files).toBeDefined();
    expect(files?.filesById).toEqual({});
  });
});
