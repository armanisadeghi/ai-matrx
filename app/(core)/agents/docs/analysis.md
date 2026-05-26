
## 1. Route structure: `app/(a)/agents/` and `app/(ssr)/ssr/agents/`

**`app/(a)/agents/`** (`/Users/armanisadeghi/code/matrx-admin/app/(a)/agents/`)

Only one file (documentation, no App Router pages):

- `/Users/armanisadeghi/code/matrx-admin/app/(a)/agents/agents-route-architecture.md`

There is **no** `page.tsx` or other route files under `(a)/agents/` in this repo. `useAgentsBasePath` still assumes an authenticated base of `/ai/agents`, but **`app/**/ai/agents/**` was not found** — the live agents UI in `app/` is under the SSR segment below.

**`app/(ssr)/ssr/agents/`**

- `/Users/armanisadeghi/code/matrx-admin/app/(ssr)/ssr/agents/page.tsx` — list (`AgentsGrid`)
- `/Users/armanisadeghi/code/matrx-admin/app/(ssr)/ssr/agents/[id]/layout.tsx` — loads agent header context, `AgentPageProvider`
- `/Users/armanisadeghi/code/matrx-admin/app/(ssr)/ssr/agents/[id]/edit/page.tsx` — builder (`AgentBuilderWrapper`)
- `/Users/armanisadeghi/code/matrx-admin/app/(ssr)/ssr/agents/[id]/run/page.tsx` — run (`AgentRunWrapper`)

**Related (not under those two roots)**

- `/Users/armanisadeghi/code/matrx-admin/app/(public)/p/research/topics/[topicId]/agents/page.tsx` — research topic agents page

---

## 2. Redux: `features/agents/redux/agent-definition/`

**Files**

| File | Path |
|------|------|
| `slice.ts` | `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/slice.ts` |
| `selectors.ts` | `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/selectors.ts` |
| `thunks.ts` | `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/thunks.ts` |
| `converters.ts` | `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/converters.ts` |
| `ACTION-REVIEW.md` | `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/ACTION-REVIEW.md` |

**Slice exports** (`agentDefinitionSlice.actions` — names only):

```701:730:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/slice.ts
export const {
  upsertAgent,
  mergePartialAgent,
  setAgentField,
  setAgentMessages,
  setAgentSettings,
  setAgentVariableDefinitions,
  setAgentContextSlots,
  setAgentTools,
  setAgentCustomTools,
  setAgentMcpServers,
  setAgentModelTiers,
  setAgentOutputSchema,
  resetAgentField,
  resetAllAgentFields,
  markAgentSaved,
  rollbackAgentOptimisticUpdate,
  undoAgentEdit,
  redoAgentEdit,
  clearAgentUndoHistory,
  markAgentFieldsLoaded,
  setAgentFetchStatus,
  setAgentLoading,
  setAgentError,
  setActiveAgentId,
  setAgentsStatus,
  setAgentsError,
  removeAgent,
  removeVersionsByParentId,
} = agentDefinitionSlice.actions;
```

Also: `agentDefinitionSlice`, default reducer export, `export type { LoadedFields }`.

**Thunks** (from the module header in `thunks.ts`): read — `fetchAgentsList`, `fetchAgentsListFull`, `fetchSharedAgents`, `fetchSharedAgentsForChat`, `fetchAgentAccessLevel`, `fetchAgentExecutionMinimal`, `fetchAgentExecutionFull`, `fetchFullAgent`, `fetchAgentVersionHistory`, `fetchAgentVersionSnapshot`, `checkAgentDrift`, `checkAgentReferences`; write — `saveAgentField`, `saveAgent`, `createAgent`, `deleteAgent`, `purgeAgentVersions`; RPC-style — `duplicateAgent`, `promoteAgentVersion`, `acceptAgentVersion`, `updateAgentFromSource`; chat bootstrap — `initializeChatAgents` plus helpers `isChatListFresh`, `isChatListStale`.

**Interfaces/types exported from thunks** include e.g. `AgentVersionHistoryItem`, `AgentVersionSnapshot`, `SharedAgentItem`, `AgentAccessLevel`, etc.

**Selectors**: large set in `selectors.ts` (registry, per-id, fetch readiness, execution payloads, field accessors, lists, active agent). Highlights in section 8 below.

**Converters**: see section 5.

---

## 3. `features/agents/redux/tools/`

**Does not exist** — no directory at `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/tools/`.

---

## 4. `fetchAgentVersionSnapshot` and `versionSnapshotRowToAgentDefinition`

There is **no** function named `versionSnapshotRowToAgentDefinition`. The RPC row is typed as `AgentVersionSnapshot`, then mapped inline into an `AgentDefinition`-shaped object passed to `upsertAgent`:

```363:435:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/thunks.ts
export const fetchAgentVersionSnapshot = createAsyncThunk<
  void,
  { agentId: string; versionNumber: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionSnapshot",
  async ({ agentId, versionNumber }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
      p_agent_id: agentId,
      p_version_number: versionNumber,
    });

    if (error) throw error;

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentVersionSnapshot;

    dispatch(
      upsertAgent({
        id: row.version_id,
        isVersion: true,
        parentAgentId: agentId,
        versionNumber: row.version_number,
        changedAt: row.changed_at,
        changeNote: row.change_note,
        // ... maps snake_case RPC fields to camelCase AgentDefinition fields ...
        mcpServers: [],
        isOwner: null,
        accessLevel: null,
        sharedByEmail: null,
      }),
    );
  },
);
```

`upsertAgent` sets `_fetchStatus` to `"versionSnapshot"` when `data.isVersion` is true:

```314:330:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/slice.ts
    upsertAgent(state, action: PayloadAction<AgentDefinition>) {
      const data = action.payload;
      const status: AgentFetchStatus = data.isVersion
        ? "versionSnapshot"
        : "full";
      const existing = state.agents[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
        markRecordClean(existing);
        applyFetchStatus(existing, status);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        markRecordClean(record);
        applyFetchStatus(record, status);
        state.agents[data.id] = record;
      }
    },
```

---

## 5. `converters.ts`

Exists at `/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/converters.ts`.

**Exports**

- `dbRowToAgentDefinition(row: AgentRow): AgentDefinition` — full `agx_agent` row → frontend; sets version flags to live-agent defaults (`isVersion: false`, etc.).
- `agentDefinitionToInsert(agent: AgentDefinition): AgentInsert`
- `agentDefinitionToUpdate(partial: Partial<AgentDefinition>): AgentUpdate`
- `export type { AgentInsert, AgentUpdate }`

`dbRowToAgentDefinition` excerpt:

```53:112:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/converters.ts
export function dbRowToAgentDefinition(row: AgentRow): AgentDefinition {
  return {
    id: row.id,
    name: row.name,
    // ... snake_case → camelCase for table columns ...
    // Live agents from the DB are never version snapshots
    isVersion: false,
    parentAgentId: null,
    versionNumber: null,
    changedAt: null,
    changeNote: null,
    // Access metadata not available from a direct row fetch —
    isOwner: null,
    accessLevel: null,
    sharedByEmail: null,
  };
}
```

Version snapshots are **not** converted here; they use the inline mapping in `fetchAgentVersionSnapshot`.

---

## 6. `useAgentsBasePath.ts`

`/Users/armanisadeghi/code/matrx-admin/features/agents/hooks/useAgentsBasePath.ts`

```1:13:/Users/armanisadeghi/code/matrx-admin/features/agents/hooks/useAgentsBasePath.ts
"use client";

import { usePathname } from "next/navigation";

/**
 * Returns the correct base path for agent routes based on the current shell.
 * SSR shell: /ssr/agents
 * Authenticated shell: /ai/agents
 */
export function useAgentsBasePath(): string {
  const pathname = usePathname();
  return pathname?.startsWith("/ssr/") ? "/ssr/agents" : "/ai/agents";
}
```

---

## 7. `AgentRunPage` and `AgentRunWrapper`

- `/Users/armanisadeghi/code/matrx-admin/features/agents/components/run/AgentRunPage.tsx` — client component; loads execution minimal payload, creates instance via `useAgentLauncher` / `launchAgent`, renders sidebar + conversation + input.
- `/Users/armanisadeghi/code/matrx-admin/features/agents/components/shared/AgentRunWrapper.tsx` — thin wrapper reading `useAgentPageContext()` and rendering `AgentRunPage`.

```6:9:/Users/armanisadeghi/code/matrx-admin/features/agents/components/shared/AgentRunWrapper.tsx
export function AgentRunWrapper() {
  const { agentId, agentName } = useAgentPageContext();
  return <AgentRunPage agentId={agentId} agentName={agentName} />;
}
```

---

## 8. `selectAgentReadyForBuilder` and `selectAgentById`

`/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/selectors.ts`

**`selectAgentById`** — memoized selector: `(state, id) => agents[id]` as `AgentDefinitionRecord | undefined`.

```45:49:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/selectors.ts
export const selectAgentById = createSelector(
  [selectAllAgents, (_state: RootState, id: string) => id],
  (agents, id): AgentDefinitionRecord | undefined => agents[id],
);
```

**`selectAgentReadyForBuilder`** — true when `_fetchStatus` is `"full"` or `"versionSnapshot"`.

```134:142:/Users/armanisadeghi/code/matrx-admin/features/agents/redux/agent-definition/selectors.ts
export const selectAgentReadyForBuilder = createSelector(
  [selectAgentFetchStatus],
  (status): boolean => status === "full" || status === "versionSnapshot",
);
```

---

### Plan takeaway

- Agents **pages** in `app/` are only under **`/ssr/agents/...`** plus research/public variants; **`(a)/agents`** is documentation only, and **`/ai/agents`** app routes were **not** found despite `useAgentsBasePath` defaulting to it outside `/ssr/`.
- **No** `features/agents/redux/tools/` slice; tool strings / custom tools live on **`AgentDefinition`** and related thunks/selectors.
- Version snapshots: **inline** mapping in **`fetchAgentVersionSnapshot`** + **`upsertAgent`**; **`converters.ts`** is for **`agx_agent`** rows only.