import type { RootState } from "@/lib/redux/store";
import { createClient } from "@/utils/supabase/client";
import {
  assertExecutionTargetLaunchable,
  resolveAgentRuntime,
} from "../runtime-resolver";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

const AGENT_ID = "agent-1";
const VERSION_ID = "version-1";
const LIVE_MODEL_ID = "model-live";
const VERSION_MODEL_ID = "model-version";

const EXTRACTION_CAPS = {
  input: ["text"],
  output: ["entities"],
  features: ["ner"],
  interaction: "extraction",
};

const TURN_CAPS = {
  input: ["text"],
  output: ["text"],
  features: [],
  interaction: "turn",
};

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

function buildState(opts?: {
  agentModelId?: string | null;
  cachedModel?: { id: string; name: string; capabilities: unknown } | null;
}): () => RootState {
  const agentModelId = opts?.agentModelId;
  const cachedModel = opts?.cachedModel;
  const state = {
    agentDefinition: {
      agents:
        agentModelId === undefined || agentModelId === null
          ? {}
          : { [AGENT_ID]: { modelId: agentModelId } },
    },
    modelRegistry: {
      entities: cachedModel ? { [cachedModel.id]: cachedModel } : {},
    },
  } as unknown as RootState;
  return () => state;
}

function mockDatabase(
  resolver: (schema: string, table: string) => QueryResult,
): void {
  const mockedCreateClient = jest.mocked(createClient);
  mockedCreateClient.mockImplementation(
    () =>
      ({
        schema: (schema: string) => ({
          from: (table: string) => {
            const query = {
              select: jest.fn(),
              eq: jest.fn(),
              maybeSingle: jest.fn(async () => resolver(schema, table)),
            };
            query.select.mockReturnValue(query);
            query.eq.mockReturnValue(query);
            return query;
          },
        }),
      }) as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authoritative model launch gate", () => {
  it("refuses a cold current agent whose authoritative model is extraction", async () => {
    mockDatabase((schema, table) => {
      if (schema === "agent" && table === "definition") {
        return { data: { model_id: LIVE_MODEL_ID }, error: null };
      }
      return {
        data: {
          id: LIVE_MODEL_ID,
          name: "gliner2-base",
          capabilities: EXTRACTION_CAPS,
        },
        error: null,
      };
    });

    const result = await assertExecutionTargetLaunchable(
      buildState(),
      AGENT_ID,
      false,
    );

    expect(result).toEqual({
      error:
        '"gliner2-base" is an extraction model (NER/classification) and can\'t run as a chat agent.',
    });
  });

  it("uses a pinned version's model instead of the live agent model", async () => {
    mockDatabase((schema, table) => {
      if (schema === "agent" && table === "definition_version") {
        return { data: { model_id: VERSION_MODEL_ID }, error: null };
      }
      return {
        data: {
          id: VERSION_MODEL_ID,
          name: "version-extractor",
          capabilities: EXTRACTION_CAPS,
        },
        error: null,
      };
    });

    const result = await assertExecutionTargetLaunchable(
      buildState({ agentModelId: LIVE_MODEL_ID }),
      VERSION_ID,
      true,
    );

    expect("error" in result && result.error).toContain("version-extractor");
  });

  it("refuses a cached agent when its model must be fetched and is extraction", async () => {
    mockDatabase(() => ({
      data: {
        id: LIVE_MODEL_ID,
        name: "cold-model-extractor",
        capabilities: EXTRACTION_CAPS,
      },
      error: null,
    }));

    const result = await assertExecutionTargetLaunchable(
      buildState({ agentModelId: LIVE_MODEL_ID }),
      AGENT_ID,
      false,
    );

    expect("error" in result && result.error).toContain("extraction model");
  });

  it("fails closed when target or model lookup fails", async () => {
    mockDatabase(() => ({
      data: null,
      error: { message: "network failure" },
    }));

    const result = await assertExecutionTargetLaunchable(
      buildState(),
      AGENT_ID,
      false,
    );

    expect("error" in result).toBe(true);
  });

  it("fails closed when interaction metadata is absent or invalid", async () => {
    const missing = await assertExecutionTargetLaunchable(
      buildState({
        agentModelId: LIVE_MODEL_ID,
        cachedModel: {
          id: LIVE_MODEL_ID,
          name: "missing-interaction",
          capabilities: { input: ["text"], output: ["text"] },
        },
      }),
      AGENT_ID,
      false,
    );
    const invalid = await assertExecutionTargetLaunchable(
      buildState({
        agentModelId: LIVE_MODEL_ID,
        cachedModel: {
          id: LIVE_MODEL_ID,
          name: "invalid-interaction",
          capabilities: { ...TURN_CAPS, interaction: "mystery" },
        },
      }),
      AGENT_ID,
      false,
    );

    expect("error" in missing).toBe(true);
    expect("error" in invalid).toBe(true);
  });

  it("routes a cold turn-based agent through python-stream", async () => {
    mockDatabase((schema, table) => {
      if (schema === "agent" && table === "definition") {
        return { data: { model_id: LIVE_MODEL_ID }, error: null };
      }
      return {
        data: {
          id: LIVE_MODEL_ID,
          name: "turn-model",
          capabilities: TURN_CAPS,
        },
        error: null,
      };
    });

    const result = await resolveAgentRuntime(buildState(), {
      agentId: AGENT_ID,
      surfaceName: undefined,
    });

    expect(result).toEqual({ runtime: "python-stream" });
  });
});
