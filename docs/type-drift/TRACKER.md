# Type drift elimination tracker

Hand-written types that duplicate names already defined in `types/python-generated/`.
Goal: alias from generated sources, fix construction/converters, remove boundary casts.

**Doctrine:** `.cursor/skills/type-fixing-agent/SKILL.md`  
**Worked example:** [`docs/type-drift-openapi-alias-example.md`](../type-drift-openapi-alias-example.md)  
**Generated hitlists:** [`generated/summary.md`](./generated/summary.md) (regenerate after each wave)

---

## Regenerate hitlists

```bash
pnpm generate:type-drift-hitlists
```

Outputs:

| File | Purpose |
|---|---|
| [`generated/summary.md`](./generated/summary.md) | Counts + links to per-feature lists |
| [`generated/all-offenders.md`](./generated/all-offenders.md) | Flat list of all 296 actionable duplicates |
| [`generated/wave-1-priority.md`](./generated/wave-1-priority.md) | Top 40 by blast radius |
| [`generated/by-feature/*.md`](./generated/by-feature/) | One hitlist per feature directory |

_Last scan: **360** name matches · **296** actionable duplicates · **853** OpenAPI schemas · **272** stream types._

---

## Fix pattern (every item)

1. Delete hand-written `interface` / duplicate `type`
2. Alias: `export type Foo = components["schemas"]["Foo"]` (or `stream-events` re-export)
3. For FE-only nullability: `NonNullableFields<components["schemas"]["Foo"]>` — not a re-declaration
4. Fix all construction sites + DB/API ingress validation
5. Remove `as unknown as` / widening at the boundary
6. Re-run `pnpm generate:type-drift-hitlists` and check off here

**Do not:** cast, widen literals to `string`, or paper over with `?? {}`.

---

## Completed

- [x] `CustomTool` / `CustomToolInputSchema` → aliased in `features/agents/types/agent-api-types.ts`
- [x] `ToolSpecRegistered` / `ToolSpecInline` / `ToolSpecAgent` → already aliased in `tool-injection.types.ts`
- [x] `LLMParams` / `IdeState` / `ChatRequestPayload` → derived wrappers (leave as-is)

---

## Wave 1 — Agents wire boundary (highest priority)

_Agents chat/manual/conversation request types + media blocks. Unblocks converter casts._

See also: [`generated/by-feature/agents.md`](./generated/by-feature/agents.md) (33 duplicates)

### `features/agents/types/agent-api-types.ts`

- [ ] `AgentStartRequest` → `NonNullableFields<components["schemas"]["AgentStartRequest"]>`
- [ ] `ConversationContinueRequest` → alias from OpenAPI
- [ ] `ToolResultsRequest` → alias from OpenAPI
- [ ] `ToolResultsResponse` → alias from OpenAPI
- [ ] `SystemInstruction` → delete; use `components["schemas"]["SystemInstructionInput"]`
- [ ] `SystemInstructionInput` → `string | components["schemas"]["SystemInstructionInput"]`

### `features/agents/types/message-types.ts`

Re-export media blocks from `stream-events.ts` (bookmarks already re-export correctly at top of file).

- [ ] `ImageBlock`
- [ ] `AudioBlock`
- [ ] `VideoBlock`
- [ ] `DocumentBlock`

### `features/agents/types/tool-injection.types.ts`

- [ ] `ClientContext` → alias from OpenAPI (align `capabilities` / `amendments` fields)

### `features/agents/types/request.types.ts`

- [ ] `UserOverrides` → alias from OpenAPI
- [ ] `ClientToolResult` → **rename** internal camelCase type; alias wire `ClientToolResult` separately
- [ ] `TimelineRenderBlock` → re-export from `stream-events.ts`

### `features/agents/redux/agent-definition/converters.ts`

- [ ] Remove `as unknown as` on `customTools` / `custom_tools` after types aligned (~lines 135, 183, 317, 393)

---

## Wave 2 — Agent service REST surface

Entire file mirrors OpenAPI — bulk alias or replace with re-exports.

**File:** `features/agents/services/agentService.types.ts` (17 duplicates)

- [ ] `AgentVariableInput`
- [ ] `CreateAgentInput`
- [ ] `UpdateAgentInput`
- [ ] `AgentSummary`
- [ ] `AgentVariableDetail`
- [ ] `AgentDetail`
- [ ] `AgentVersionInfo`
- [ ] `CatalogTree`
- [ ] `ModelInfo`
- [ ] `ToolInfo`
- [ ] `SkillInfo`
- [ ] `SchemaFinding`
- [ ] `SchemaGateReport`
- [ ] `ValidateSchemaRequest`

---

## Wave 3 — PDF extractor (single-file bulk win)

**File:** `features/pdf-extractor/types.ts` — **50** duplicates in one file.

See: [`generated/by-feature/pdf-extractor.md`](./generated/by-feature/pdf-extractor.md)

- [ ] Bulk pass: replace file contents with OpenAPI aliases from `api-types.ts`
- [ ] Audit call sites for field-level drift after alias swap

---

## Wave 4 — RAG + file analysis

| Feature | Count | Hitlist |
|---|---|---|
| file-analysis | 40 | [`generated/by-feature/file-analysis.md`](./generated/by-feature/file-analysis.md) |
| rag | 32 | [`generated/by-feature/rag.md`](./generated/by-feature/rag.md) |

- [ ] RAG search-lab API types (`AgentToolSearchRequest`, `ExpandRequest`, …)
- [ ] File analysis API types (`AnalyzeRefreshBody`, `AnnotationOut`, …)

---

## Wave 5 — Remaining features

| Feature | Count | Hitlist |
|---|---|---|
| files | 27 | [`generated/by-feature/files.md`](./generated/by-feature/files.md) |
| scheduling | 20 | [`generated/by-feature/scheduling.md`](./generated/by-feature/scheduling.md) |
| (non-feature) | 19 | [`generated/by-feature/_non-feature_.md`](./generated/by-feature/_non-feature_.md) |
| administration | 10 | [`generated/by-feature/administration.md`](./generated/by-feature/administration.md) |
| research | 8 | [`generated/by-feature/research.md`](./generated/by-feature/research.md) |
| action-catalog | 7 | [`generated/by-feature/action-catalog.md`](./generated/by-feature/action-catalog.md) |
| tasks | 7 | [`generated/by-feature/tasks.md`](./generated/by-feature/tasks.md) |
| secrets | 6 | [`generated/by-feature/secrets.md`](./generated/by-feature/secrets.md) |
| kg-graph | 5 | [`generated/by-feature/kg-graph.md`](./generated/by-feature/kg-graph.md) |
| scraper | 5 | [`generated/by-feature/scraper.md`](./generated/by-feature/scraper.md) |
| _others (≤3 each)_ | 17 | see [`generated/summary.md`](./generated/summary.md) |

---

## Change log

| Date | Change |
|---|---|
| 2026-07-01 | Initial tracker + `pnpm generate:type-drift-hitlists` script. 296 actionable duplicates catalogued. `CustomTool`/`CustomToolInputSchema` fixed. |
