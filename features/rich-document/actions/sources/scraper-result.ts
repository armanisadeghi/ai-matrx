// features/rich-document/actions/sources/scraper-result.ts
//
// Source adapter for scraper-result content. Phase 0: only instanceKeyPrefix.

import type { ContentSource, ContentSourceAdapter } from "../../types";

export const scraperResultAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "scraper-result") {
      throw new Error(
        `scraperResultAdapter received non-scraper-result source: ${source.type}`,
      );
    }
    return `scr-${source.runId}`;
  },
};
