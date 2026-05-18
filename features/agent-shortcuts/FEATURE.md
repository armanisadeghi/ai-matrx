# FEATURE.md — `agent-shortcuts`

**Status:** `migrating` (multi-scope UI in progress; see phases 11–13)
**Tier:** `1`
**Last updated:** `2026-04-25`

---

## Purpose

A **Shortcut** is a stored, first-class invocation of a specific agent version that auto-maps variables from the surrounding UI context. Most Shortcuts eliminate user input entirely — the user clicks, variables wire in from what's already on screen, and the agent runs. Shortcuts are the primary way agents get embedded throughout the product (context menus, quick-actions, buttons on cards, editor integrations, etc.).

---

## Entry points

**Routes**
- `app/(authenticated)/(admin-auth)/administration/system-agents/shortcuts/` — admin shortcuts CRUD (**renamed 2026-04-22** from `administration/agent-shortcuts/shortcuts/`; now nested under the broader "System Agents" umbrella alongside builtin agents and system apps)
- `app/(a)/agents/shortcuts/` — user shortcuts CRUD
- `app/(authenticated)/org/[slug]/shortcuts/` — org shortcuts CRUD
- Multi-scope UI progress docs:
  - `features/agents/migration/phases/phase-11-admin-shortcuts-ui.md` — admin/system shortcuts (see Phase 11b addendum for the rename)
  - `features/agents/migration/phases/phase-12-user-shortcuts-ui.md` — user-owned shortcuts
  - `features/agents/migration/phases/phase-13-org-shortcuts-ui.md` — org-owned shortcuts

**Feature code** (`features/agent-shortcuts/`)
- `components/` — CRUD components shared across admin/user/org scopes
- `hooks/` — React hooks for listing, creating, editing, running
- `types.ts`, `utils/`, `constants.ts`, `index.ts` — usual layout

**Redux** (split — note this!)
- `features/agents/redux/agent-shortcuts/` — canonical slice, types, selectors, thunks. Do NOT create a parallel slice under `features/agent-shortcuts/redux/`.
- `features/agents/redux/agent-shortcut-categories/` — categories slice

**Invocation**
- Shortcut click → `createInstanceFromShortcut` factory (`features/agents/redux/execution-system/thunks/create-instance.thunk.ts`) → `launchConversation` thunk.

---

## Data model

Canonical type from `features/agents/redux/agent-shortcuts/types.ts`:

```ts
interface AgentShortcut {
  id: string;
  categoryId: string;
  label: string;
  description: string | null;
  iconName: string | null;
  keyboardShortcut: string | null;
  sortOrder: number;
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;              // false ⇒ version-pinned (default); true ⇒ follow current pointer
  enabledContexts: ShortcutContext[];
  scopeMappings: Record<string, string> | null;  // UI-context-key → agent-variable-name
  resultDisplay: ResultDisplay;    // displayMode + variableInputStyle + flags
  allowChat: boolean;
  autoRun: boolean;
  applyVariables: boolean;
  showVariables: boolean;
  usePreExecutionInput: boolean;
  isActive: boolean;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Scope columns** (`userId` / `organizationId` / `projectId` / `taskId`) are how the same table backs System, Organization, and Personal shortcuts. See [`features/scopes/FEATURE.md`](../scopes/FEATURE.md).

---

## UI-context contract — how variables bind

Every surface that hosts Shortcuts (code editor, Notes, Agent Builder, user-built apps) exposes a **UI context object**. The Shortcut maps agent variables to keys on this object via `scopeMappings`.

### Universal keys (available on every surface)

| Key | Meaning |
|---|---|
| `selection` | Currently highlighted content |
| `textBefore` / `textAfter` | Text surrounding the selection or cursor |
| `content` | Primary payload of the current view (surface decides) |
| `context` | Broader situational context (surface decides) |
| `appFeature` | Which feature within the app the user is in |
| `featureAgentOverview` | Description of the current feature's purpose for the agent |
| `user_overview` | Normalized summary of the user |

### Surface-specific extensions

Each host adds its own keys on top. The coding surface, for example, adds `vsc_active_file_path`, `vsc_active_file_content`, `vsc_selected_text`, `vsc_diagnostics`, `vsc_workspace_*`, `vsc_git_*`. See [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md).

### The pattern: `enableShortcuts` on components

A structured component (like Card — with title + description fields) flips one flag — `enableShortcuts` — and every instance instantly gains a context menu wired to System + Organization + Personal shortcuts. `content` maps to the card body, `context` to its title. The three-tier scoping shows all three categories side by side to the user.

---

## Configuration axes

**`displayMode`** (13 options) — how the result is presented:
`inline` · `sidebar` · `modal-full` · `modal-compact` · `chat-bubble` · `flexible-panel` · `panel` · `toast` · `floating-chat` · `chat-collapsible` · `chat-assistant` · `background` · `direct` (caller manages the UI)

**`variableInputStyle`** (6 layouts) — how variables are collected when input is needed:
`inline` · `wizard` · `form` · `compact` · `guided` · `cards`

**Other flags** that reshape the experience:

| Flag | What it controls |
|---|---|
| `autoRun` | `true` = fire immediately; `false` = show variable inputs first |
| `allowChat` | `true` = multi-turn allowed; `false` = one turn and done |
| `usePreExecutionInput` | With `autoRun`, still give the user a confirm step (optional `preExecutionMessage`) |
| `showVariablePanel` | Let the user see and modify auto-bound variable values |
| `showDefinitionMessages` | Expose non-system messages baked into the agent definition |
| `showDefinitionMessageContent` | When shown, render full content vs just the user's literal text |
| `showSubAgents` | When `false`, sub-agent turns are filtered from the transcript selector |
| `hideReasoning` / `hideToolResults` | Clean up what the user sees mid-run |

---

## Key flows

### Flow 1 — Admin creates an org shortcut

1. Admin at `/ai/shortcuts/` creates a new shortcut. Sets `organizationId` on the record, leaves `userId` null.
2. Picks agent + version (pinned by default — `useLatest: false`, `agentVersionId` = current version at pin time).
3. Defines `scopeMappings` from UI context keys → agent variables.
4. Chooses `displayMode`, `variableInputStyle`, `autoRun`, etc.
5. Save → row inserted into shortcut table → visible to every member of that org.

### Flow 2 — User clicks a shortcut

1. Surface renders context menu via `enableShortcuts`. List filtered by scope + `enabledContexts`.
2. User clicks. `scopeMappings` resolved from the live UI context object.
3. `createInstanceFromShortcut({ shortcutId, uiContext, ... })` builds an execution instance: variable values prefilled via mapping; `agentVersionId` pinned.
4. `launchConversation` dispatched.
5. Result rendered per `displayMode`.

### Flow 3 — Version drift surfaces

1. Admin updates the underlying agent. A new version row is written (see [`AGENT_VERSIONING`](../agents/docs/AGENT_VERSIONING.md)).
2. Every pinned shortcut is flagged as drifted in the admin UI.
3. Admin reviews the variable-list diff; advances the pin if safe.

---

## Invariants & gotchas

- **Pin-by-version is default.** `useLatest: true` is rare and risky — silent agent changes break embedded shortcuts. Document why when you set it.
- **Agents have no awareness of Shortcuts.** A shortcut is a wrapper — the agent sees a normal invocation with variables already filled.
- **Redux slice lives under `features/agents/redux/agent-shortcuts/`, not under `features/agent-shortcuts/`.** Extend that slice; never create a parallel one.
- **Multi-scope from day one.** A shortcut belongs to exactly one scope row (user / org / project / task), but the CRUD components must work for all scopes — build once, reuse across admin/user/org routes per CLAUDE.md.
- **`scopeMappings` targets variable NAMES, not indexes.** Renaming a variable on the agent is a breaking change for every pinned shortcut using that mapping.
- **Shortcuts can trigger Workflows** instead of a single agent (`features/workflows/` — currently broken per CLAUDE.md, out of scope).
- **Shortcuts can ship their own source code** for custom rendering — they're not limited to variable bindings. See [`features/tool-call-visualization/FEATURE.md`](../tool-call-visualization/FEATURE.md).

---

## Related features

- **Depends on:** `features/agents/` (the agent being invoked), `features/agent-context/` (broker resolution for scope), `features/scope-system/`
- **Depended on by:** Every surface that embeds AI — code editor, notes, agent-builder, user-built apps, context-menu consumers
- **Cross-links:** `features/agents/docs/AGENT_VERSIONING.md`, `features/agents/docs/AGENT_INVOCATION_LIFECYCLE.md`, `features/agents/agent-system-mental-model.md` §5

---

## Current work / migration state

Redux slice + types + selectors exist and are canonical. UI surfaces that invoke shortcuts are mid-migration — legacy `features/context-menu/` + `features/quick-actions/` still consume the old prompts/builtins path; the bridge to the new shortcuts slice is being built. Migration phases:

- Phase 01 — foundation
- Phase 03 — unified context menu
- Phase 04 — quick actions replacement
- Phases 11–13 — admin/user/org shortcuts UI

See `features/agents/migration/MASTER-PLAN.md`.

---

## Change log

- `2026-04-25` — Org and System Agents shortcut routes: imports use `components/*`, `hooks/*`, and `types` instead of the `@/features/agent-shortcuts` root barrel.
- `2026-04-22` — claude: initial FEATURE.md extracted from `agent-system-mental-model.md` §5.
- `2026-04-22` — claude: admin route renamed `administration/agent-shortcuts/` → `administration/system-agents/` and folded into a broader System Agents umbrella (adds builtin-agent builder/runner and system-apps management under the same subnav). All internal link references updated. Shortcuts/categories/content-blocks surfaces unchanged in behavior.

---

> **Keep-docs-live:** changes to `AgentShortcut` type, display modes, input styles, universal UI-context keys, or scope semantics must update this doc + `features/agents/docs/AGENT_VERSIONING.md` if version behavior is touched.
