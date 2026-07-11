// Types for the AI Dream Agent Service REST surface (`/agent-service/*`).
// OpenAPI (`types/python-generated/api-types.ts`) is the sole source of truth —
// never hand-mirror these schemas. Regen: `pnpm sync-types`.

import type { components } from "@/types/python-generated/api-types";

export type ResponseFormat = "text" | "json" | "json_schema";
export type FeedbackType = "bug" | "feature" | "suggestion" | "other";

export type AgentVariableInput = components["schemas"]["AgentVariableInput"];
export type CreateAgentInput = components["schemas"]["CreateAgentInput"];
export type UpdateAgentInput = components["schemas"]["UpdateAgentInput"];
export type AgentSummary = components["schemas"]["AgentSummary"];
export type AgentVariableDetail = components["schemas"]["AgentVariableDetail"];
export type AgentDetail = components["schemas"]["AgentDetail"];
export type AgentVersionInfo = components["schemas"]["AgentVersionInfo"];
export type CatalogTree = components["schemas"]["CatalogTree"];
export type ModelInfo = components["schemas"]["ModelInfo"];
export type ToolInfo = components["schemas"]["ToolInfo"];
export type SkillInfo = components["schemas"]["SkillInfo"];
export type SchemaFinding = components["schemas"]["SchemaFinding"];
export type SchemaGateReport = components["schemas"]["SchemaGateReport"];
export type ValidateSchemaRequest =
  components["schemas"]["ValidateSchemaRequest"];

/** Query params for catalog list endpoints — not a named OpenAPI schema. */
export interface CatalogQuery {
  category?: string;
  tags?: string[];
  query?: string;
  limit?: number;
}
