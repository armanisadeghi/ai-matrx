/**
 * A video / image run on /agents/[id]/run is labelled as a JOB even though
 * that page never loads the model catalog: `labelGenerationJob` fetches the
 * one missing model, then labels the request. Before 2026-09-26 the ordinary
 * run path never labelled anything, so the job card never appeared.
 */

import type { RootState } from "@/lib/redux/store";

const fetchModelById = jest.fn((id: string) => ({ type: "fetchModelById", id }));
jest.mock("@/features/ai-models/redux/modelRegistrySlice", () => ({
  fetchModelById: (id: string) => fetchModelById(id),
  selectModelById: (state: { modelRegistry: { entities: Record<string, unknown> } }, id: string) =>
    state.modelRegistry.entities[id],
}));
jest.mock(
  "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors",
  () => ({ selectCurrentSettings: () => () => undefined }),
);

import {
  labelGenerationJob,
  resolveGenerationJob,
  selectRunModelId,
} from "@/features/agents/runtime/generation-job";

const VEO = {
  id: "8eb0413e-10c2-4f6d-99f1-4aea3a8434a4",
  name: "veo-3.1-generate-preview",
  common_name: "Veo 3.1",
  capabilities: { input: ["text", "image"], output: ["video"], features: [] },
};

function makeState(withModel: boolean) {
  return {
    conversations: { byConversationId: { c1: { agentId: "a1" } } },
    agentDefinition: { agents: { a1: { modelId: VEO.id } } },
    modelRegistry: { entities: withModel ? { [VEO.id]: VEO } : {} },
  } as unknown as RootState;
}

test("the run model is the agent's own when nothing overrides it", () => {
  expect(selectRunModelId(makeState(true), "c1")).toBe(VEO.id);
});

test("a video model is a video job named by its common name", () => {
  expect(resolveGenerationJob(makeState(true), "c1")).toEqual({
    kind: "video",
    modelLabel: "Veo 3.1",
    firstResponseSeconds: null,
  });
});

test("a model missing from the catalog is fetched, then the request is labelled", async () => {
  let state = makeState(false);
  const actions: { type: string; payload?: unknown }[] = [];
  const dispatch = jest.fn(async (action: { type: string; payload?: unknown }) => {
    actions.push(action);
    if (action.type === "fetchModelById") state = makeState(true);
    return action;
  });
  await labelGenerationJob(dispatch as never, () => state, "r1", "c1");
  expect(fetchModelById).toHaveBeenCalledWith(VEO.id);
  const labelled = actions.find((a) => a.type.endsWith("setRequestGenerationJob"));
  expect(labelled?.payload).toEqual({
    requestId: "r1",
    job: { kind: "video", modelLabel: "Veo 3.1", firstResponseSeconds: null },
  });
});
