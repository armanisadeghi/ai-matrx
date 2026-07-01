# Type drift example: CustomTool (OpenAPI alias required)

Reference case for fixing duplicate hand-written API types. Pattern applies everywhere `features/**/types/*.ts` re-declares schemas that already exist in `types/python-generated/api-types.ts`.

**Fix doctrine** — Reality Check (what a real fix involves), forbidden "fixes", and the required sequence (make the error count go UP before it goes down) — lives canonically in the **`type-safety`** skill (`.claude/skills/type-safety/SKILL.md`). This document is that skill's worked example.

---

## Core problem

Duplicate (hand-written — wrong)

**File:** `features/agents/types/agent-api-types.ts`

| Export | Line |
|---|---|
| `CustomToolInputSchema` | 381 |
| `CustomToolDefinition` | 426 |

OpenAPI source of truth (never re-declare):

| Schema | File | Line |
|---|---|---|
| `CustomTool` | `types/python-generated/api-types.ts` | ~18144 |
| `CustomToolInputSchema` | `types/python-generated/api-types.ts` | ~18160 |
| `InlineToolSpec` | `types/python-generated/api-types.ts` | ~21692 |

Correct pattern (see `features/agents/types/tool-injection.types.ts:38`):

```typescript
export type ToolSpecInline = components["schemas"]["InlineToolSpec"];
```

---

## How the duplicate balloons

| File | What |
|---|---|
| `features/agents/types/agent-definition.types.ts` | 255 — `customTools: CustomToolDefinition[]` |
| `features/agents/components/tools-management/AgentToolsManager.tsx` | imports + uses both types |
| `features/agents/redux/agent-definition/converters.ts` | 135, 183 — `as unknown as` casts |
| `features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts` | 350 — `as NonNullable<ToolSpecInline[...]>` cast |

---

## Type error (real) and false fix (wrong)

Assigning loose internal `CustomToolInputSchema` to wire `ToolSpecInline["input_schema"]` fails because internal `properties[].type` is `string`; OpenAPI requires `JsonSchemaProperty` (`"string" | "number" | …`).

**Compiler error (before false fix):**

```
Type 'CustomToolInputSchema' is not assignable to type '{ type: "object"; properties?: … JsonSchemaProperty … }'.
Types of property 'properties' are incompatible.
  Type 'string' is not assignable to type '"string" | "number" | "boolean" | …'
```

**False fix — cast to silence TypeScript (does not validate; bad data still hits Python):**

`features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts`

```typescript
      seedFromAgent.push({
        kind: "inline",
        name: ct.name,
        description: ct.description ?? "",
        input_schema: (ct.input_schema ?? {
          type: "object",
          properties: {},
          required: [],
        }) as NonNullable<ToolSpecInline["input_schema"]>,
      });
```

**Related false fixes in converters:**

```typescript
      customTools.push(
        spec as unknown as AgentDefinition["customTools"][number],
      );
```

```typescript
    ((row.custom_tools as unknown as AgentDefinition["customTools"]) ?? []);
```

---

## Fix (to apply here, then replicate everywhere)

1. Delete hand-written `CustomToolInputSchema` / `CustomToolDefinition` in `agent-api-types.ts`.
2. Alias from OpenAPI: `CustomTool` = `components["schemas"]["CustomTool"]` (OpenAPI name — not `CustomToolDefinition`).
3. Update consumers; remove boundary casts.
4. Validate at DB/import ingress (`Json` → typed), not at wire send with `as`.

**Status:** documented — fix pending.
