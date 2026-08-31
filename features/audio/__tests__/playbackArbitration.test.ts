import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  claimPlayback,
  getActivePlaybackHolderId,
  releasePlayback,
} from "@/features/audio/playback/playbackLock";

const ROOT = process.cwd();

afterEach(() => {
  for (const id of ["podcast", "file", "education", "fast-fire"]) {
    releasePlayback(id);
  }
});

describe("app-wide playback arbitration", () => {
  it("makes a new audible path synchronously stop the previous holder", () => {
    const stopped: string[] = [];
    claimPlayback({ id: "podcast", stop: () => stopped.push("podcast") });

    claimPlayback({ id: "file", stop: () => stopped.push("file") });

    expect(stopped).toEqual(["podcast"]);
    expect(getActivePlaybackHolderId()).toBe("file");
  });

  it("does not let a preempted path release the current holder", () => {
    claimPlayback({ id: "education", stop: () => {} });
    claimPlayback({ id: "fast-fire", stop: () => {} });

    releasePlayback("education");

    expect(getActivePlaybackHolderId()).toBe("fast-fire");
  });
});

describe("Q4 playback surfaces use the canonical arbitration boundary", () => {
  const managedSurface = (relativePath: string) =>
    readFileSync(join(ROOT, relativePath), "utf8");

  it.each([
    "features/files/components/core/FilePreview/previewers/AudioPreview.tsx",
    "features/flashcards/fast-fire/components/SpokenFrontPlayer.tsx",
    "features/flashcards/fast-fire/components/FastFireReviewPlayer.tsx",
    "features/flashcards/fast-fire/components/FastFireReviewPlaylist.tsx",
  ])("routes %s through useMediaElementPlaybackSession", (relativePath) => {
    const source = managedSurface(relativePath);
    expect(source).toContain("useMediaElementPlaybackSession({");
  });

  it("routes durable study-session audio through the package playback port", () => {
    const source = managedSurface(
      "features/education/study/components/SessionAudio.tsx",
    );
    expect(source).toContain("<InlineMediaRef");
    expect(source).toContain('as="audio"');
    expect(source).not.toMatch(/<audio(?:\s|>)/);
  });

  it("routes the recovered public audio-study episode through the shared element", () => {
    const source = managedSurface(
      "features/education/media/audio/components/AudioPlayback.tsx",
    );
    expect(source).toContain("<SessionMediaElement");
    expect(source).toContain('as="audio"');

    const detail = managedSurface(
      "features/education/media/audio/components/AudioStudyDetail.tsx",
    );
    expect(detail).toContain('import { AudioPlayback } from "./AudioPlayback"');
    expect(detail).toContain("<AudioPlayback");
  });
});
