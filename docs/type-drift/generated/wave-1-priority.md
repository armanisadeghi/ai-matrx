# Type drift — wave 1 priority (top 40)

_Generated: 2026-07-01T23:23:32.100Z_

Ordered by estimated blast radius (agents wire boundary > interfaces > feature concentration).

Regenerate: `pnpm generate:type-drift-hitlists`

| # | Type | Source | Status | Location | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | AgentStartRequest | api-types | duplicate | `features/agents/types/agent-api-types.ts:278` |  |
| 2 | ConversationContinueRequest | api-types | duplicate | `features/agents/types/agent-api-types.ts:395` |  |
| 3 | ToolResultsRequest | api-types | duplicate | `features/agents/types/agent-api-types.ts:419` |  |
| 4 | ToolResultsResponse | api-types | duplicate | `features/agents/types/agent-api-types.ts:423` |  |
| 5 | AgentVariableInput | api-types | duplicate | `features/agents/services/agentService.types.ts:9` |  |
| 6 | CreateAgentInput | api-types | duplicate | `features/agents/services/agentService.types.ts:14` |  |
| 7 | UpdateAgentInput | api-types | duplicate | `features/agents/services/agentService.types.ts:26` |  |
| 8 | AgentSummary | api-types | duplicate | `features/agents/services/agentService.types.ts:44` |  |
| 9 | AgentVariableDetail | api-types | duplicate | `features/agents/services/agentService.types.ts:55` |  |
| 10 | AgentDetail | api-types | duplicate | `features/agents/services/agentService.types.ts:62` |  |
| 11 | AgentVersionInfo | api-types | duplicate | `features/agents/services/agentService.types.ts:80` |  |
| 12 | CatalogTree | api-types | duplicate | `features/agents/services/agentService.types.ts:89` |  |
| 13 | ModelInfo | api-types | duplicate | `features/agents/services/agentService.types.ts:96` |  |
| 14 | ToolInfo | api-types | duplicate | `features/agents/services/agentService.types.ts:106` |  |
| 15 | SkillInfo | api-types | duplicate | `features/agents/services/agentService.types.ts:114` |  |
| 16 | SchemaFinding | api-types | duplicate | `features/agents/services/agentService.types.ts:123` |  |
| 17 | SchemaGateReport | api-types | duplicate | `features/agents/services/agentService.types.ts:130` |  |
| 18 | ValidateSchemaRequest | api-types | duplicate | `features/agents/services/agentService.types.ts:136` |  |
| 19 | SystemInstructionInput | api-types | duplicate | `features/agents/types/agent-api-types.ts:176` |  |
| 20 | ImageBlock | stream-events | duplicate | `features/agents/types/message-types.ts:80` |  |
| 21 | AudioBlock | stream-events | duplicate | `features/agents/types/message-types.ts:116` |  |
| 22 | VideoBlock | stream-events | duplicate | `features/agents/types/message-types.ts:147` |  |
| 23 | DocumentBlock | stream-events | duplicate | `features/agents/types/message-types.ts:185` |  |
| 24 | PendingCallSummary | api-types | duplicate | `features/agents/api/fetch-pending-calls.ts:39` |  |
| 25 | ValidationIssue | api-types | duplicate | `features/agents/components/settings-management/validation/types.ts:29` |  |
| 26 | ValidationResult | api-types | duplicate | `features/agents/components/settings-management/validation/types.ts:39` |  |
| 27 | JsonRpcResponse | api-types | duplicate | `features/agents/services/mcp-client/ http-transport.ts:15` |  |
| 28 | JsonRpcResponse | api-types | duplicate | `features/agents/services/mcp-client/http-transport.ts:15` |  |
| 29 | UserOverrides | api-types | duplicate | `features/agents/types/request.types.ts:743` |  |
| 30 | ClientContext | api-types | duplicate | `features/agents/types/tool-injection.types.ts:95` |  |
| 31 | ConversationRecord | api-types | duplicate | `features/agents/redux/execution-system/conversations/conversations.slice.ts:40` |  |
| 32 | ValidationResult | api-types | duplicate | `features/agents/runtime/validation.ts:31` |  |
| 33 | ClientToolResult | api-types | name-collision | `features/agents/types/request.types.ts:890` | Same name as wire type; internal shape differs — rename local type, alias wire separately |
| 34 | TimelineRenderBlock | stream-events | duplicate | `features/agents/types/request.types.ts:558` |  |
| 35 | MediaRef | api-types | duplicate | `features/pdf-extractor/types.ts:29` |  |
| 36 | PdfPageRange | api-types | duplicate | `features/pdf-extractor/types.ts:34` |  |
| 37 | PdfCropBox | api-types | duplicate | `features/pdf-extractor/types.ts:37` |  |
| 38 | ExtractPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:41` |  |
| 39 | CropPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:42` |  |
| 40 | RotatePagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:43` |  |
