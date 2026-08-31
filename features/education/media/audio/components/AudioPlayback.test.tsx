/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AudioPlayback } from "./AudioPlayback";

const fetchEpisodeById = jest.fn();

jest.mock("@/features/podcasts/service", () => ({
  podcastService: { fetchEpisodeById: (...args: unknown[]) => fetchEpisodeById(...args) },
}));

jest.mock("@/features/education/study/components/SessionAudio", () => ({
  SessionAudio: ({ fileId }: { fileId: string }) => (
    <div data-testid="file-audio">{fileId}</div>
  ),
}));

jest.mock("@/features/audio/session/SessionMediaElement", () => ({
  SessionMediaElement: ({ src }: { src: string }) => (
    <div data-testid="episode-audio">{src}</div>
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
    act(() => root.render(<AudioPlayback fileId="file-123" episodeId="episode-123" />));
    expect(host.querySelector('[data-testid="file-audio"]')?.textContent).toBe(
      "file-123",
    );
    expect(fetchEpisodeById).not.toHaveBeenCalled();
  });

  it("renders a recovered episode URL", async () => {
    fetchEpisodeById.mockResolvedValue({ audio_url: "https://cdn.example/audio.mp3" });
    await act(async () => {
      root.render(<AudioPlayback fileId={null} episodeId="episode-123" />);
      await Promise.resolve();
    });
    expect(host.querySelector('[data-testid="episode-audio"]')?.textContent).toBe(
      "https://cdn.example/audio.mp3",
    );
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
