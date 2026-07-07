---
name: association-entity-select
description: Place or extend the canonical AssociationEntitySelect — the ONE compact "name dropdown" for the entities of one token associated with a container (active entity's name + inline rename + always-visible switcher + unlink + "+ Add New" create-and-attach). Use whenever a surface needs to show WHICH note/session/chat/document a panel is bound to and let the user rename it, switch among the container's entities, or start a new one — "add a note switcher", "show the session name", "let the user rename this from the toolbar", "the dropdown should offer add-new". Covers the default adapter, writing a bespoke adapter, and the generic createEntityRow/renameEntityRow services. NOT for count cards (AssociationCard), row lists (AssociationList), or cross-type attach (UniversalAssociationPicker).
---

# AssociationEntitySelect — the canonical name dropdown

**One control, five jobs, per (token, container):** display the active entity's real name (registry icon) · inline rename (click the name) · switch via an **always-visible** dropdown (searchable past 5 items) · per-row unlink (non-active rows, edge only — never deletes the entity) · trailing **"+ New \<Entity\>"** that creates + associates + activates (typed search text doubles as the new name).

Component: `features/scopes/components/associations/AssociationEntitySelect.tsx`. Redux-free; everything flows through an **adapter**. Docs: `features/scopes/FEATURE.md` §"Association cards + list".

## The CREATE-then-ASSOCIATE contract (applies to EVERY association surface)

Two component classes, one law each:

1. **Associate-existing** (pickers, "Add" panels): the ONLY job is the edge — it must be written and verified (`AssociationWriteResult.ok`), and failure must toast. An "attach" that silently no-ops is the bug class.
2. **Create-then-associate** (upload file → attach, "+ New Note", new doc → attach): the item is created FIRST (durable row — it exists in the user's library regardless of what happens next), the edge is written SECOND (idempotent, retry-once is safe). **Every terminal outcome is loud, and a created-but-unlinked item is reported WITH its location** ("Uploaded to your Files (War Room folder) but couldn't attach — use Add file to retry"). The user gesture must never end in silence: cancellation, zero-result, create-failure, and attach-failure each get their own message. A created item that vanishes without a trace is the exact bug this contract kills.

References: `ThreadResourcesTab.handleFilesSelected` (upload → attach, all outcomes loud) and `useAssociationEntitySelectAdapter.createAndAttach` (create → attach with retry + created-but-unlinked toast).

## Rules

- **Never rebuild any face of this** — no bespoke note/session switchers, no standalone rename spans next to a separate dropdown, no "+ New X" menu items wired by hand. If a toolbar shows an entity's name, this component owns that name.
- **The dropdown never hides.** `items.length === 1` (or 0) still renders the chevron — "add another" must always be reachable. That gap is the bug this component exists to kill.
- Unlink ≠ delete: `detach` removes the association edge only. The active row never shows the X (switch first).
- Registry-driven: icon/labels come from `getEntityInfo(token)`. The token needs a `titleColumn` in `ENTITY_OVERLAY` (`features/scopes/registry/entityRegistry.ts`) for generic create/rename.

## Plain container → default adapter

```tsx
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { useAssociationEntitySelectAdapter } from "@/features/scopes/hooks/useAssociationEntitySelect";

const adapter = useAssociationEntitySelectAdapter({
  token: "note",
  container: { type: "project", id: projectId, orgId },
  activeId,            // optional (controlled); omit → first attached row
  onActiveChange,      // optional
  createColumns: {},   // NOT NULL columns the registry conventions can't know
});
<AssociationEntitySelect token="note" adapter={adapter} />
```

Reads via `useContainerLinks` + `useEntityTitles`; creates via `createEntityRow` + `attach`; renames via `renameEntityRow`. Both row writes live in `features/scopes/service/entityRows.ts` (registry titleColumn + owner/org conventions, loud errors, primes `primeEntityTitle` so no surface renders stale).

## Bespoke lifecycle → implement `AssociationEntitySelectAdapter`

When the surface has its own active semantics or create pipeline, implement the interface (exported from the component file): `{ loading, items, activeId, setActive, createAndAttach, rename, detach? }`.

**Reference implementation:** `features/war-room/hooks/useThreadEntitySelect.ts` — `useThreadNoteSelectAdapter` (is_active edge metadata, notes autosave rename via `notesApi.update` + `upsertNoteFromServer`) and `useThreadAudioSessionSelectAdapter` (`studio_sessions` titles + `updateSessionThunk` rename). Consumers: `ThreadNotesTab` / `ThreadAudioTab` / `ThreadAgentTab`.

Adapter contract details:
- `createAndAttach(title)` must create the row, write the association, AND make it active; return the new id or null. **Optional** — omit it when creation isn't name-driven and pass the component's **`createSlot`** instead: a custom footer (ReactNode or `(close) => ReactNode`) replacing the name-input creator. Reference: the war-room Chat tab passes the canonical `AgentListDropdown` — "+ New Chat" = pick an AGENT, which mints a conversation (`startThreadConversation`); the label shows the agent's name until the server auto-labels the conversation after its first turn (`useThreadConversationSelectAdapter`'s label chain).
- `rename(id, title)` returns false on failure (the component toasts + keeps the editor open). Call `primeEntityTitle(token, id, title)` on success.
- Items carry real titles — positional fallbacks (`Note 2`, `Recording 3`) only for unhydrated rows.

## Props worth knowing

`renameActivation` ("click" | "doubleClick", default click) · `align` · `emptyLabel` · `showIcon` / `iconClassName` · `className` / `labelClassName`. Toolbar-dense by default (h-6, text-xs).
