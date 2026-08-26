import { describe, expect, it } from "@jest/globals";

import {
  stashPendingStart,
  takePendingStart,
} from "../pendingStart";
import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";

describe("pending podcast start ownership", () => {
  it("lets only one overlapping boot claim the generation request", () => {
    const runId = "overlapping-boot-run";
    const request = {
      input_data_type: "topic",
      input_data: "Atomic mount decision",
    } as PodcastGenerateRequest;

    stashPendingStart(runId, request);

    expect(takePendingStart(runId)).toBe(request);
    expect(takePendingStart(runId)).toBeNull();
  });
});
