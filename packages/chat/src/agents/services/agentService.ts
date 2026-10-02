// Typed client for the AI Dream Agent Service (`/agent-service/*`).
//
// Uses the shared python-client helpers, which resolve the backend base URL and
// attach the Supabase JWT (Authorization: Bearer) automatically — the same auth
// the server validates. Admin-gated server-side; a non-admin gets 401/403.
//
// Scope note: agent field CRUD stays direct-to-Supabase (the app's convention).
// This client is for the SERVER-ONLY capabilities — the meta-agent `create*`
// and the provider-aware schema gate (`validateSchema`) — plus the catalog read
// model + reference lookups. Running an agent uses the existing streaming path,
// not this client.

import { apiGet, apiPatch, apiPost, buildPath } from "@/lib/api/typed-client";

import type {
  AgentDetail,
  AgentVersionInfo,
  CatalogQuery,
  CatalogTree,
  CreateAgentInput,
  ModelInfo,
  SchemaGateReport,
  SkillInfo,
  ToolInfo,
  UpdateAgentInput,
  ValidateSchemaRequest,
} from "@/features/agents/services/agentService.types";

// --- discovery -------------------------------------------------------------

export async function listAgents(query: CatalogQuery = {}): Promise<CatalogTree> {
  // `tags` is a string[] the server reads as repeated query params
  // (`?tags=a&tags=b`); the typed client's serializer emits arrays that way.
  const { data } = await apiGet("/agent-service/agents", {
    query: {
      category: query.category,
      tags: query.tags,
      query: query.query,
      limit: query.limit,
    },
  });
  return data;
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const { data } = await apiGet(
    buildPath("/agent-service/agents/{agent_id}", { agent_id: agentId }),
  );
  return data;
}

export async function listVersions(agentId: string): Promise<AgentVersionInfo[]> {
  const { data } = await apiGet(
    buildPath("/agent-service/agents/{agent_id}/versions", {
      agent_id: agentId,
    }),
  );
  return data;
}

export async function getVersion(versionId: string): Promise<AgentDetail> {
  const { data } = await apiGet(
    buildPath("/agent-service/versions/{version_id}", {
      version_id: versionId,
    }),
  );
  return data;
}

// --- reference lookups -----------------------------------------------------

export async function listModels(includeDeprecated = false): Promise<ModelInfo[]> {
  // Preserve exact wire: `false` currently sends NO `include_deprecated` param
  // (the old `qs` mapped it to `undefined`); withQuery keeps `false`, so route
  // `false → undefined` to stay drop-on-false.
  const { data } = await apiGet("/agent-service/models", {
    query: { include_deprecated: includeDeprecated ? true : undefined },
  });
  return data;
}

export async function listTools(query: CatalogQuery = {}): Promise<ToolInfo[]> {
  // `tags` is a string[] the server reads as repeated query params
  // (`?tags=a&tags=b`); the typed client's serializer emits arrays that way.
  const { data } = await apiGet("/agent-service/tools", {
    query: {
      category: query.category,
      tags: query.tags,
      query: query.query,
    },
  });
  return data;
}

export async function listSkills(query: CatalogQuery = {}): Promise<SkillInfo[]> {
  const { data } = await apiGet("/agent-service/skills", {
    query: {
      category: query.category,
      query: query.query,
      limit: query.limit,
    },
  });
  return data;
}

// --- authoring (server-only: meta-agent + schema gate) ---------------------

export async function createAgent(input: CreateAgentInput): Promise<AgentDetail> {
  const { data } = await apiPost("/agent-service/agents", input);
  return data;
}

export async function createStructuredAgent(input: CreateAgentInput): Promise<AgentDetail> {
  const { data } = await apiPost("/agent-service/agents/structured", input);
  return data;
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentDetail> {
  const { data } = await apiPatch(
    buildPath("/agent-service/agents/{agent_id}", { agent_id: agentId }),
    input,
  );
  return data;
}

export async function validateSchema(req: ValidateSchemaRequest): Promise<SchemaGateReport> {
  const { data } = await apiPost("/agent-service/validate-schema", req);
  return data;
}
