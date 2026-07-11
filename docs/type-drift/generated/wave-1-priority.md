# Type drift — wave 1 priority (top 40)

_Generated: 2026-07-11T14:08:07.824Z_

Ordered by estimated blast radius (agents wire boundary > interfaces > feature concentration).

Regenerate: `pnpm generate:type-drift-hitlists`

| # | Type | Source | Status | Location | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | ImageBlock | stream-events | duplicate | `features/agents/types/message-types.ts:79` |  |
| 2 | AudioBlock | stream-events | duplicate | `features/agents/types/message-types.ts:113` |  |
| 3 | VideoBlock | stream-events | duplicate | `features/agents/types/message-types.ts:142` |  |
| 4 | DocumentBlock | stream-events | duplicate | `features/agents/types/message-types.ts:174` |  |
| 5 | PendingCallSummary | api-types | duplicate | `features/agents/api/fetch-pending-calls.ts:39` |  |
| 6 | ValidationIssue | api-types | duplicate | `features/agents/components/settings-management/validation/types.ts:29` |  |
| 7 | ValidationResult | api-types | duplicate | `features/agents/components/settings-management/validation/types.ts:39` |  |
| 8 | JsonRpcResponse | api-types | duplicate | `features/agents/services/mcp-client/http-transport.ts:15` |  |
| 9 | PicklistBinding | api-types | duplicate | `features/agents/types/agent-definition.types.ts:82` |  |
| 10 | ContextItemBinding | api-types | duplicate | `features/agents/types/agent-definition.types.ts:150` |  |
| 11 | ClientContext | api-types | duplicate | `features/agents/types/tool-injection.types.ts:111` |  |
| 12 | ConversationRecord | api-types | duplicate | `features/agents/redux/execution-system/conversations/conversations.slice.ts:44` |  |
| 13 | ValidationResult | api-types | duplicate | `features/agents/runtime/validation.ts:31` |  |
| 14 | TimelineRenderBlock | stream-events | duplicate | `features/agents/types/request.types.ts:573` |  |
| 15 | MediaRef | api-types | duplicate | `features/pdf-extractor/types.ts:43` |  |
| 16 | PdfPageRange | api-types | duplicate | `features/pdf-extractor/types.ts:48` |  |
| 17 | PdfCropBox | api-types | duplicate | `features/pdf-extractor/types.ts:51` |  |
| 18 | ExtractPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:55` |  |
| 19 | CropPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:56` |  |
| 20 | RotatePagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:57` |  |
| 21 | DeletePagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:58` |  |
| 22 | MergePdfsRequest | api-types | duplicate | `features/pdf-extractor/types.ts:59` |  |
| 23 | SplitPdfRequest | api-types | duplicate | `features/pdf-extractor/types.ts:60` |  |
| 24 | PdfPipelineOptions | api-types | duplicate | `features/pdf-extractor/types.ts:65` |  |
| 25 | RenderPageRequest | api-types | duplicate | `features/pdf-extractor/types.ts:86` |  |
| 26 | RenderAllPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:87` |  |
| 27 | RenderThumbnailRequest | api-types | duplicate | `features/pdf-extractor/types.ts:88` |  |
| 28 | ReorderPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:89` |  |
| 29 | InsertPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:90` |  |
| 30 | DuplicatePagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:91` |  |
| 31 | StudioRenderRequest | api-types | duplicate | `features/pdf-extractor/types.ts:92` |  |
| 32 | PdfStudioCatalog | api-types | duplicate | `features/pdf-extractor/types.ts:95` |  |
| 33 | PdfStudioCategorySchema | api-types | duplicate | `features/pdf-extractor/types.ts:96` |  |
| 34 | PdfStudioPresetSchema | api-types | duplicate | `features/pdf-extractor/types.ts:97` |  |
| 35 | PdfStudioBundleSchema | api-types | duplicate | `features/pdf-extractor/types.ts:98` |  |
| 36 | DetectRepeatedRegionsRequest | api-types | duplicate | `features/pdf-extractor/types.ts:102` |  |
| 37 | StripRepeatedRegionsRequest | api-types | duplicate | `features/pdf-extractor/types.ts:104` |  |
| 38 | ClassifyPagesRequest | api-types | duplicate | `features/pdf-extractor/types.ts:106` |  |
| 39 | ExtractReadingOrderRequest | api-types | duplicate | `features/pdf-extractor/types.ts:107` |  |
| 40 | RedactRegionsRequest | api-types | duplicate | `features/pdf-extractor/types.ts:127` |  |
