// features/podcasts/intelligence-places.ts
//
// WHERE EACH PODCAST JOB RUNS — drawn on /intelligence/podcast (covers
// `podcast.*` and `podcast_client.*`). The script, audio and artwork jobs run
// inside the server pipeline; the page shows them without a place until the
// pipeline records one. Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PODCAST_PLACES: FeaturePlaces = {
  feature: "podcast",
  label: "Podcasts",
  extraPrefixes: ["podcast_client"],
  roots: ["features/podcasts"],
  places: [
    {
      id: "create",
      label: "New episode",
      trigger: "Topic ideas, read a web page or YouTube video",
      urlPattern: "/podcast/studio/create",
      mandateKeys: [
        K.podcast_client__topic_ideas,
        K.podcast_client__web_content_extractor,
        K.podcast_client__youtube_research,
      ],
      sources: [
        "features/podcasts/generator/components/TopicIdeaHelper.tsx",
        "features/podcasts/generator/useSourceResolvers.ts",
      ],
    },
    {
      id: "episode",
      label: "An episode",
      trigger: "Title options, chapters, blog post, show notes",
      urlPattern: "/podcast/studio/run/[id]",
      mandateKeys: [
        K.podcast__title_optimizer,
        K.podcast__chapter_marker,
        K.podcast_client__blog_writer,
        K.podcast_client__show_notes,
      ],
      sources: [
        "features/podcasts/generator/useEpisodeTitleOptions.ts",
        "features/podcasts/generator/useEpisodeChapters.ts",
        "features/podcasts/generator/useEpisodeArticles.ts",
      ],
    },
  ],
};
