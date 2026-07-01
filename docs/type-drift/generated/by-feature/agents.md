# agents — type drift hitlist

_Generated: 2026-07-01T23:23:32.104Z_

**34** actionable duplicates in this feature.

Regenerate: `pnpm generate:type-drift-hitlists`

## `features/agents/api/fetch-pending-calls.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| PendingCallSummary | interface | api-types | 39 | duplicate |  |

## `features/agents/components/settings-management/validation/types.ts` (2)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ValidationIssue | interface | api-types | 29 | duplicate |  |
| ValidationResult | interface | api-types | 39 | duplicate |  |

## `features/agents/redux/execution-system/conversations/conversations.slice.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ConversationRecord | type | api-types | 40 | duplicate |  |

## `features/agents/runtime/validation.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ValidationResult | type | api-types | 31 | duplicate |  |

## `features/agents/services/agentService.types.ts` (14)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| AgentVariableInput | interface | api-types | 9 | duplicate |  |
| CreateAgentInput | interface | api-types | 14 | duplicate |  |
| UpdateAgentInput | interface | api-types | 26 | duplicate |  |
| AgentSummary | interface | api-types | 44 | duplicate |  |
| AgentVariableDetail | interface | api-types | 55 | duplicate |  |
| AgentDetail | interface | api-types | 62 | duplicate |  |
| AgentVersionInfo | interface | api-types | 80 | duplicate |  |
| CatalogTree | interface | api-types | 89 | duplicate |  |
| ModelInfo | interface | api-types | 96 | duplicate |  |
| ToolInfo | interface | api-types | 106 | duplicate |  |
| SkillInfo | interface | api-types | 114 | duplicate |  |
| SchemaFinding | interface | api-types | 123 | duplicate |  |
| SchemaGateReport | interface | api-types | 130 | duplicate |  |
| ValidateSchemaRequest | interface | api-types | 136 | duplicate |  |

## `features/agents/services/mcp-client/ http-transport.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| JsonRpcResponse | interface | api-types | 15 | duplicate |  |

## `features/agents/services/mcp-client/http-transport.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| JsonRpcResponse | interface | api-types | 15 | duplicate |  |

## `features/agents/types/agent-api-types.ts` (5)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| SystemInstructionInput | type | api-types | 176 | duplicate |  |
| AgentStartRequest | interface | api-types | 278 | duplicate |  |
| ConversationContinueRequest | interface | api-types | 395 | duplicate |  |
| ToolResultsRequest | interface | api-types | 419 | duplicate |  |
| ToolResultsResponse | interface | api-types | 423 | duplicate |  |

## `features/agents/types/message-types.ts` (4)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ImageBlock | interface | stream-events | 80 | duplicate |  |
| AudioBlock | interface | stream-events | 116 | duplicate |  |
| VideoBlock | interface | stream-events | 147 | duplicate |  |
| DocumentBlock | interface | stream-events | 185 | duplicate |  |

## `features/agents/types/request.types.ts` (3)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| TimelineRenderBlock | interface | stream-events | 558 | duplicate |  |
| UserOverrides | interface | api-types | 743 | duplicate |  |
| ClientToolResult | interface | api-types | 890 | name-collision | Same name as wire type; internal shape differs — rename local type, alias wire separately |

## `features/agents/types/tool-injection.types.ts` (1)

| Type | Kind | Source | Line | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| ClientContext | interface | api-types | 95 | duplicate |  |
