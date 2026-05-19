// features/rich-document/actions/sources/artifact.ts
//
// Source adapter for artifact content. Phase 0: only instanceKeyPrefix.

import type { ContentSource, ContentSourceAdapter } from "../../types";

export const artifactAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "artifact") {
      throw new Error(
        `artifactAdapter received non-artifact source: ${source.type}`,
      );
    }
    return `art-${source.artifactId}`;
  },
};
