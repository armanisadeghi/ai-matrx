// features/rich-document/actions/sources/prompt-result.ts
//
// Source adapter for prompt-result content. Phase 0: only instanceKeyPrefix.

import type { ContentSource, ContentSourceAdapter } from "../../types";

export const promptResultAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "prompt-result") {
      throw new Error(
        `promptResultAdapter received non-prompt-result source: ${source.type}`,
      );
    }
    return `pr-${source.executionId}`;
  },
};
