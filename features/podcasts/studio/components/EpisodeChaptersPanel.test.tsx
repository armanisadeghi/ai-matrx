import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

let mockRegisteredHandlers: Record<string, (value: unknown) => Promise<void>> = {};
let mockLiveChapters = [{ start_hint: "00:00", title: "Generated opening", summary: "" }];

jest.mock("@/features/podcasts/generator/useEpisodeChapters", () => ({
  useEpisodeChapters: jest.fn(),
}));
jest.mock("@/features/podcasts/service", () => ({
  podcastService: { fetchEpisodeById: jest.fn(), saveEpisodeChapters: jest.fn() },
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceWriteHandlers: jest.fn(),
}));
jest.mock("@/components/mardown-display/blocks/media-chapters/MediaChaptersBlock", () => ({
  __esModule: true,
  default: ({ serverData }: { serverData: { chapters: Array<{ title: string }> } }) => (
    <div data-testid="chapter-list">{serverData.chapters.map((chapter) => chapter.title).join(",")}</div>
  ),
}));

import { useEpisodeChapters } from "@/features/podcasts/generator/useEpisodeChapters";
import { podcastService } from "@/features/podcasts/service";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { EpisodeChaptersPanel } from "@/features/podcasts/studio/components/EpisodeChaptersPanel";

const mockGenerate = jest.fn();
const mockFetchEpisodeById = podcastService.fetchEpisodeById as jest.Mock;
const mockSaveEpisodeChapters = podcastService.saveEpisodeChapters as jest.Mock;
const mockUseEpisodeChapters = useEpisodeChapters as jest.Mock;
const mockUseSurfaceWriteHandlers = useSurfaceWriteHandlers as jest.Mock;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const episode: PcEpisodeWithShow = {
  id: "episode-1", slug: "episode-1", show_id: null, created_by: "admin-user",
  title: "Episode", description: null, audio_url: "https://cdn.example.com/episode.mp3",
  image_url: null, og_image_url: null, thumbnail_url: null, video_url: null,
  display_mode: "audio_only", episode_number: null, duration_seconds: 10,
  host_count: null, speakers: null, script: "HOST: Test.", chapters: null,
  is_published: false, created_at: "2026-09-17T00:00:00Z",
  updated_at: "2026-09-17T00:00:00Z", show: null,
};

describe("EpisodeChaptersPanel regeneration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    mockRegisteredHandlers = {};
    mockLiveChapters = [{ start_hint: "00:00", title: "Generated opening", summary: "" }];
    mockGenerate.mockReset();
    mockFetchEpisodeById.mockReset().mockResolvedValue(episode);
    mockSaveEpisodeChapters.mockReset();
    mockUseEpisodeChapters.mockImplementation(() => ({
      chapters: mockLiveChapters,
      busy: false,
      generate: mockGenerate,
    }));
    mockUseSurfaceWriteHandlers.mockImplementation(
      (_surface: string, handlers: Record<string, (value: unknown) => Promise<void>>) => {
        mockRegisteredHandlers = handlers;
      },
    );
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => {
      root.render(<EpisodeChaptersPanel episodeId={episode.id} />);
      await Promise.resolve();
    });
  });

  afterEach(() => act(() => root.unmount()));

  async function writeAgentChapters() {
    const agentWritten = [{ start_hint: "00:00", title: "Agent-written", summary: "" }];
    mockSaveEpisodeChapters.mockResolvedValue({
      ...episode, chapters: agentWritten, audioMetadataDurationSeconds: 10.410958,
    });
    await act(async () => {
      await mockRegisteredHandlers.episode_chapters({ chapters: agentWritten });
    });
    expect(container.textContent).toContain("Agent-written");
  }

  async function clickRegenerate() {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Regenerate"),
    );
    expect(button).toBeDefined();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  it("releases an agent-written override after a successful regenerated save", async () => {
    await writeAgentChapters();
    mockGenerate.mockImplementation(async () => {
      mockLiveChapters = [{ start_hint: "00:00", title: "Regenerated", summary: "" }];
      return true;
    });
    await clickRegenerate();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Regenerated");
  });

  it("keeps the agent-written chapters visible when regeneration fails", async () => {
    await writeAgentChapters();
    mockGenerate.mockResolvedValue(false);
    await clickRegenerate();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Agent-written");
  });
});
