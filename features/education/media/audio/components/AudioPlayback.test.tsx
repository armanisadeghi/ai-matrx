/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AudioPlayback } from "./AudioPlayback";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fetchEpisodeById = jest.fn();

jest.mock("@/features/podcasts/service", () => ({
  podcastService: {
    fetchEpisodeById: (...args: unknown[]) => fetchEpisodeById(...args),
  },
}));

jest.mock("@ai-matrx/media/core", () => ({
  useMediaResolution: (ref: string | null) => ({
    resolution: ref ? { src: `resolved:${ref}` } : null,
  }),
}));

jest.mock("@/features/podcasts/components/player/PodcastAudioPlayer", () => ({
  PodcastAudioPlayer: ({
    audioUrl,
    title,
  }: {
    audioUrl: string;
    title?: string;
  }) => (
    <div data-testid="podcast-audio">
      {audioUrl} {title}
    </div>
  ),
}));

describe("AudioPlayback", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => fetchEpisodeById.mockReset());

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("prefers the durable file identity without reading the episode", () => {
    act(() =>
      root.render(
        <AudioPlayback
          fileId="file-123"
          episodeId="episode-123"
          title="Study audio"
        />,
      ),
    );
    expect(
      host.querySelector('[data-testid="podcast-audio"]')?.textContent,
    ).toContain("resolved:file-123");
    expect(host.textContent).toContain("Study audio");
    expect(fetchEpisodeById).not.toHaveBeenCalled();
  });

  it("renders a recovered episode URL", async () => {
    fetchEpisodeById.mockResolvedValue({
      audio_url: "https://cdn.example/audio.mp3",
    });
    await act(async () => {
      root.render(<AudioPlayback fileId={null} episodeId="episode-123" />);
      await Promise.resolve();
    });
    expect(
      host.querySelector('[data-testid="podcast-audio"]')?.textContent,
    ).toContain("resolved:https://cdn.example/audio.mp3");
  });

  it("replaces the spinner with an honest error when recovery fails", async () => {
    fetchEpisodeById.mockResolvedValue(null);
    await act(async () => {
      root.render(<AudioPlayback fileId={null} episodeId="missing-episode" />);
      await Promise.resolve();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "This audio study could not be loaded. Try again.",
    );
    expect(host.textContent).not.toContain("Loading audio…");
  });
});
