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

import { getJson, patchJson, postJson } from "@/lib/python-client";

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

const BASE = "/agent-service";

function qs(params: Record<string, string | number | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, item));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// --- discovery -------------------------------------------------------------

export async function listAgents(query: CatalogQuery = {}): Promise<CatalogTree> {
  const { data } = await getJson<CatalogTree>(
    `${BASE}/agents${qs({ category: query.category, tags: query.tags, query: query.query, limit: query.limit })}`,
  );
  return data;
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const { data } = await getJson<AgentDetail>(`${BASE}/agents/${agentId}`);
  return data;
}

export async function listVersions(agentId: string): Promise<AgentVersionInfo[]> {
  const { data } = await getJson<AgentVersionInfo[]>(`${BASE}/agents/${agentId}/versions`);
  return data;
}

export async function getVersion(versionId: string): Promise<AgentDetail> {
  const { data } = await getJson<AgentDetail>(`${BASE}/versions/${versionId}`);
  return data;
}

// --- reference lookups -----------------------------------------------------

export async function listModels(includeDeprecated = false): Promise<ModelInfo[]> {
  const { data } = await getJson<ModelInfo[]>(
    `${BASE}/models${qs({ include_deprecated: includeDeprecated ? "true" : undefined })}`,
  );
  return data;
}

export async function listTools(query: CatalogQuery = {}): Promise<ToolInfo[]> {
  const { data } = await getJson<ToolInfo[]>(
    `${BASE}/tools${qs({ category: query.category, tags: query.tags, query: query.query })}`,
  );
  return data;
}

export async function listSkills(query: CatalogQuery = {}): Promise<SkillInfo[]> {
  const { data } = await getJson<SkillInfo[]>(
    `${BASE}/skills${qs({ category: query.category, query: query.query, limit: query.limit })}`,
  );
  return data;
}

// --- authoring (server-only: meta-agent + schema gate) ---------------------

export async function createAgent(input: CreateAgentInput): Promise<AgentDetail> {
  const { data } = await postJson<AgentDetail, CreateAgentInput>(`${BASE}/agents`, input);
  return data;
}

export async function createStructuredAgent(input: CreateAgentInput): Promise<AgentDetail> {
  const { data } = await postJson<AgentDetail, CreateAgentInput>(`${BASE}/agents/structured`, input);
  return data;
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentDetail> {
  const { data } = await patchJson<AgentDetail, UpdateAgentInput>(`${BASE}/agents/${agentId}`, input);
  return data;
}

export async function validateSchema(req: ValidateSchemaRequest): Promise<SchemaGateReport> {
  const { data } = await postJson<SchemaGateReport, ValidateSchemaRequest>(
    `${BASE}/validate-schema`,
    req,
  );
  return data;
}
