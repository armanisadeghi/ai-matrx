const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ single: mockSingle }));
const mockEq = jest.fn(() => ({ select: mockSelect }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ update: mockUpdate }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: mockSchema },
}));

import * as chapterTiming from "@/features/podcasts/chapter-timing";
import { podcastService } from "@/features/podcasts/service";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

const requested = [
  { start_hint: "00:00", title: "Open", summary: "" },
  { start_hint: "00:25", title: "Middle", summary: "" },
  { start_hint: "00:52", title: "Close", summary: "" },
];

const episode: PcEpisodeWithShow = {
  id: "a4d537e5-0526-4ea0-a2f5-9f15cab97b0f",
  slug: "chapter-timing-qa",
  show_id: null,
  created_by: "admin-user",
  title: "Chapter timing QA",
  description: null,
  audio_url: "https://cdn.example.com/chapter-timing.mp3",
  image_url: null,
  og_image_url: null,
  thumbnail_url: null,
  video_url: null,
  display_mode: "audio_only",
  episode_number: null,
  duration_seconds: null,
  host_count: null,
  speakers: null,
  script: "HOST: Test.",
  chapters: null,
  is_published: false,
  created_at: "2026-09-17T00:00:00Z",
  updated_at: "2026-09-17T00:00:00Z",
  show: null,
};

describe("podcastService.saveEpisodeChapters timing boundary", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockSingle.mockReset();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockUpdate.mockClear();
    mockFrom.mockClear();
    mockSchema.mockClear();
  });

  it("persists playable markers and an int4-safe duration from exact audio metadata", async () => {
    jest.spyOn(podcastService, "fetchEpisodeById").mockResolvedValue(episode);
    jest
      .spyOn(chapterTiming, "resolveAudioMetadataDuration")
      .mockResolvedValue(10.410958);
    mockSingle.mockResolvedValue({
      data: {
        ...episode,
        chapters: [
          { start_hint: "00:00", title: "Open", summary: "" },
          { start_hint: "00:05", title: "Middle", summary: "" },
          { start_hint: "00:10", title: "Close", summary: "" },
        ],
        duration_seconds: 10,
      },
      error: null,
    });

    await podcastService.saveEpisodeChapters(episode.id, requested);

    expect(mockUpdate).toHaveBeenCalledWith({
      chapters: [
        { start_hint: "00:00", title: "Open", summary: "" },
        { start_hint: "00:05", title: "Middle", summary: "" },
        { start_hint: "00:10", title: "Close", summary: "" },
      ],
      duration_seconds: 10,
    });
  });
});
