# Migrate Legacy Recipe / Prompt Execution → Agent Execution

Reusable playbook for converting surfaces that still call the deleted prompt/recipe/socket stack to the agent execution system. **First application:** `features/scraper` (2026-06-28).

## When to use this doc

Use when a feature still has any of:

| Legacy signal | What it means |
|---|---|
| `run_recipe_to_chat` | Socket task that ran a recipe as chat |
| `recipe_id` in task payload | Recipe UUID (now an **agent id**) |
| `broker_values` / `broker_id` | Variable slot values (now **agent variables**) |
| `@/lib/redux/stream-tasks/**` | Deleted socket task Redux layer |
| `@/features/prompts/**` execution hooks | `usePromptExecution`, `executeBuiltinWith*`, etc. |
| `@/lib/redux/prompt-execution/**` | Deleted prompt execution slice |
| Stubbed task selectors (`taskStatus = "not_found"`) | Someone removed socket wiring but left callers |

**Do not migrate** surfaces that only use `context-menu-v3` / agent shortcuts — that is already the new system.

---

## Core invariant

> **Same UUIDs, new transport.** Recipe ids and broker slot ids were preserved when prompts became agents. Pass the old recipe UUID as `agentId` and map each broker UUID to a key in `variables`.

```typescript
// BEFORE (deleted)
createTask({ service: "ai_chat_service", taskName: "run_recipe_to_chat" });
setTaskFields({
  taskId,
  fields: {
    chat_config: { recipe_id: AGENT_UUID, ... },
    broker_values: [{ id: SLOT_UUID, name: SLOT_UUID, value: text }],
  },
});
submitTask({ taskId });

// AFTER
await run({
  agentId: AGENT_UUID,
  variables: { [SLOT_UUID]: text },
  onChunk: setStreamingResponse, // optional live UI
});
```

---

## Step-by-step checklist

### 1. Audit the feature path

1. Grep the route + feature folder for: `recipe`, `broker`, `prompt`, `stream-tasks`, `socketTasks`, `run_recipe`, `usePrompt`, `features/workflows`.
2. Classify each hit:
   - **Execution** (must migrate)
   - **Display-only** (markdown parsers, UI — keep)
   - **Already agent-native** (context menu v3, `launchAgentExecution`, `useRunAgent` — keep)
3. List build breakers first (imports of deleted modules).

### 2. Pick the execution primitive

| Use case | Primitive | Location |
|---|---|---|
| One-shot run, stream text into local UI | `useRunAgent` | `features/agents/run/useRunAgent.ts` |
| Thin feature wrapper with cancel + streaming state | Feature hook wrapping `useRunAgent` | e.g. `useScraperAgentAnalysis` |
| Managed instance, overlays, chat follow-up | `launchAgentExecution` + Redux selectors | `features/agents/redux/execution-system/` |
| System builtin, extract JSON/code from response | `executeBuiltinWithJsonExtraction` / `executeBuiltinWithCodeExtraction` | `execute-builtin-with-extraction.thunks.ts` |
| Full test modal / widget surface | `useAgentLauncher` | `features/agents/hooks/useAgentLauncher.ts` |

**Default for inline tabs / fire-and-forget analysis:** `useRunAgent`.

### 3. Centralize agent + variable ids

Create a constants file in the feature (not scattered in components):

```typescript
// features/<feature>/constants/analysis-agents.ts
export const MY_FEATURE_AGENTS = {
  someAnalysis: {
    agentId: "<legacy-recipe-uuid>",
    contentVariableId: "<legacy-broker-uuid>",
  },
} as const;
```

Document where the UUIDs came from (recipe name, original broker label) in a one-line comment.

### 4. Replace the hook / component

1. Remove all `@/lib/redux/stream-tasks` imports.
2. Remove stubbed Redux selectors — wire real `isLoading`, `error`, `streamingResponse` from the agent hook.
3. Use `useEffect` cleanup to `abort()` in-flight runs when inputs change or component unmounts.
4. Rename folders: `recipes/` → `agent-analysis/` (or feature-specific name). Delete dead files.

### 5. Remove orphaned infrastructure

- Delete imports of deleted packages (`features/workflows`, `ScraperResultsComponent`, etc.).
- Retire routes that only existed for socket task deep-links → `redirect()` to the modern entry.
- Update `FEATURE.md` Change Log.

### 6. Verify

```bash
# No legacy execution left in the feature
rg -i "run_recipe|recipe_id|broker_values|stream-tasks|features/prompts" features/<feature>/

# Typecheck touched files
pnpm exec tsc --noEmit --pretty false 2>&1 | rg "<feature>"
```

Manual: enable the migrated UI path, confirm streaming text appears, errors surface, re-run on input change cancels prior run.

---

## Scraper reference implementation

| Before | After |
|---|---|
| `parts/recipes/useRenQuickRecipe.ts` | `hooks/useScraperAgentAnalysis.ts` |
| `parts/recipes/FactChecker.tsx` | `parts/agent-analysis/FactChecker.tsx` |
| `parts/recipes/KeywordAnalysis.tsx` | `parts/agent-analysis/KeywordAnalysis.tsx` |
| `constants/analysis-agents.ts` | Agent + variable UUID registry |
| `ScraperResultsComponent` + `/scraper/[id]` | Redirect to `/scraper` |
| `SerpResultsPage` (workflows) | Removed (dead import) |

Routes `app/(transitional)/scraper/*` were already on `useScraperApi` — only the **analysis tabs** and **task deep-link** needed migration.

---

## Common mistakes

1. **Using broker `name` instead of slot UUID as the variable key** — keys must match the agent's declared variable id (the old broker uuid).
2. **Leaving stub selectors** — if `streamingResponse` is hardcoded to `""`, the UI will look broken even when the agent runs.
3. **Forgetting abort on unmount** — duplicate runs and race conditions on tab switches.
4. **Routing through Next.js to Python for agent runs** — client calls Python directly via `useBackendApi` + `ENDPOINTS.ai.agentStart`.
5. **Migrating context-menu-v3** — it's already agent shortcuts; don't rip it out.

---

## After each migration

1. Append to `features/agents/migration/INVENTORY.md` if new legacy surface discovered.
2. Add Change Log line to the feature's `FEATURE.md`.
3. Link this doc from the feature README or FEATURE.md if the feature has multiple agent-backed tabs.

---

## Change log

| Date | Change |
|---|---|
| 2026-06-28 | Created from scraper migration (first full application). |
