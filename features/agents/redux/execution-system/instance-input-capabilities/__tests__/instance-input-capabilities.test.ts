import reducer, {
  initInputCapabilities,
  resetInputCapabilityOverride,
  setInputCapabilityOverride,
  updateBaseInputCapabilities,
} from "../instance-input-capabilities.slice";
import { selectAttachmentCapabilities } from "../instance-input-capabilities.selectors";
import type { RootState } from "@/lib/redux/store";

describe("instance input capabilities", () => {
  it("keeps frontend capability state independent from model overrides", () => {
    const initialized = reducer(
      undefined,
      initInputCapabilities({
        conversationId: "c1",
        base: {
          image_urls: true,
          file_urls: false,
          youtube_videos: true,
        },
      }),
    );
    const overridden = reducer(
      initialized,
      setInputCapabilityOverride({
        conversationId: "c1",
        key: "file_urls",
        value: true,
      }),
    );

    const state = {
      instanceInputCapabilities: overridden,
    } as RootState;

    expect(selectAttachmentCapabilities("c1")(state)).toEqual({
      supportsImageUrls: true,
      supportsFileUrls: true,
      supportsYoutubeVideos: true,
      supportsAudio: true,
    });
    expect(state).not.toHaveProperty("instanceModelOverrides");
  });

  it("restores the snapshotted base when an override is reset", () => {
    const initialized = reducer(
      undefined,
      initInputCapabilities({
        conversationId: "c1",
        base: { image_urls: true },
        overrides: { image_urls: false },
      }),
    );
    const reset = reducer(
      initialized,
      resetInputCapabilityOverride({
        conversationId: "c1",
        key: "image_urls",
      }),
    );

    expect(
      selectAttachmentCapabilities("c1")({
        instanceInputCapabilities: reset,
      } as RootState).supportsImageUrls,
    ).toBe(true);
    expect(reset.byConversationId.c1?.persistence).toBe("pending");
  });

  it("updates the live builder base without discarding conversation deltas", () => {
    const initialized = reducer(
      undefined,
      initInputCapabilities({
        conversationId: "c1",
        base: { image_urls: false, file_urls: false },
        overrides: { image_urls: true },
      }),
    );
    const updated = reducer(
      initialized,
      updateBaseInputCapabilities({
        conversationId: "c1",
        base: { image_urls: false, file_urls: true },
      }),
    );

    expect(updated.byConversationId.c1).toMatchObject({
      base: { image_urls: false, file_urls: true },
      overrides: { image_urls: true },
    });
  });
});
