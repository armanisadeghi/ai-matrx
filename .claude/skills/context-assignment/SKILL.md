---
name: context-assignment
description: Use whenever a task touches context selection, scope tagging, or the ctx system UI at matrx-frontend — adding a context picker to a surface, showing per-entity context status, tagging files/notes/agents to scopes, setting the working (active) context, filtering by context, or upload-time context prompts. Triggers on features/scopes/components/context-assignment/**, active-context/**, ContextAssignmentField, ActiveContextButton, ContextStatusButton, UploadContextPrompt, appContextSlice, ctx_scope_assignments, or any request like "add context selection to X", "tag this entity", "show context status". Read this BEFORE wiring any context UI — picking the wrong mode or writer is the #1 recurring failure.
---

# Context assignment — picking the right component

## The mental model (read this or you WILL wire it wrong)

1. **Membership, not ownership.** A USER belongs to MULTIPLE organizations
   (personal workspace + any number of real orgs). Never assume one org per
   user, never force an org choice before showing projects/tasks — both can
   be org-less ("unassigned"), and that is normal, not an error.
2. **The hierarchy:** organization → scope types (the org's custom dimensions,
   e.g. Clients, Matters) → scopes (instances, e.g. "Acme Corp") → context
   items (typed fields per scope). Tasks may live in projects but DON'T have
   to; projects may live in orgs but DON'T have to.
3. **A scope NEVER implies its organization.** Org is an independent context
   dimension — it is part of a selection only when explicitly checked.
   Display follows the same rule (`ContextSummaryChips` enforces it).
4. **Active vs durable — the load-bearing distinction:**
   - **Active (working) context** = "what I'm doing right now"; ephemeral;
     lives in `appContextSlice`; feeds every agent run automatically
     (execute-instance stamps it). MULTI-scope (keyed by scope id since
     2026-06-12), single org/project/task.
   - **Durable assignment** = "this entity belongs to these"; persisted in
     `ctx_scope_assignments` via the `setEntityScopes` chokepoint.
   - Never write one when the user meant the other. Never auto-convert
     active → durable (suggest only).

## Component selection table

| You need… | Use | Mode/notes |
|---|---|---|
| Tag an entity (file/note/agent/…) inline on a page | `ContextAssignmentField` | `mode="assignment"`, pass `subject` |
| Same, without blocking the page | `ContextAssignmentPopover` | trigger = your button |
| Same, as an explicit modal step | `ContextAssignmentDialog` | controlled `open` |
| Same, floating/draggable | `ContextAssignmentWindow` | inline-controlled |
| Set the WORKING context from a header/toolbar | `ActiveContextButton` | the ONLY drop-in Surface A writer; sizes `xs`/`sm`, `iconOnly` for rails |
| Show context status per entity (amber/green nudge) | `ContextStatusButton` | pass `knownScopeCount` on list rows (bulk!), omit on single-entity surfaces |
| Display a selection readably | `ContextSummaryChips` | "Client: Acme", org only if explicit |
| Prompt for context during an upload | `UploadContextPrompt` | Save awaits `awaitFileIds()` — handles both races |
| Filter a list by context (no saving!) | `ContextAssignmentField mode="filter"` | emits via `onSelectionChange`; zero save-side effects |

All in `features/scopes/components/context-assignment/` except
`ActiveContextButton` (`features/scopes/components/active-context/` —
Surface A writers MUST live there; ESLint + FEATURE.md enforce it).

## Hard rules

- **Fetch discipline.** The org/type/scope tree is fetched ONCE at boot into
  Redux and refreshed only by `scopeTreeInvalidationMiddleware` on structural
  mutations. Components NEVER refetch it. Projects/tasks/items go through
  `context-assignment/data.ts` (60s TTL + in-flight dedup). List surfaces use
  `getEntityScopesBulk`/`primeEntityScopes` — N rows must never mean N
  requests. Add new reads to `data.ts`, never to a component.
- **Write paths.** Scopes → `useEntityScopes().setScopes` /
  `setEntityScopes` thunk only. Active context → dispatch from
  `active-context/` components only. Entity FKs (e.g. a note's project_id)
  → that feature's save pipeline, applied from `onSaved`'s selection (see
  `features/notes/components/NoteContextSection.tsx` as the template).
- **Org default-but-changeable.** Surfaces that "enforce" an org pass
  `defaultOrganizationId`; the user can always switch.
- **No layout shift.** Fixed section heights; fixed-size check targets;
  status icons swap glyphs, never dimensions.
- **Project/task durable links** log-and-toast until the `ctx_associations`
  migration (docs/ctx/ctx-association-architecture.md) lands — keep it loud,
  never silent.

## Live references

- Design surface / every variant demoed: `/demos/scopes/context-lab`
  (`app/(dev)/demos/scopes/context-lab/page.dev.tsx`).
- Real integrations to copy from: files table cell
  (`features/files/components/surfaces/desktop/FileContextCell.tsx`), upload
  prompt host (`features/files/components/surfaces/PageShell.tsx`), note
  adapter (`NoteContextSection.tsx`), header button (`ChatRunHeader.tsx`).
- Current state + open items: `docs/ctx/CONTEXT_ROLLOUT_HANDOFF.md`.
- Architecture bible: `docs/ctx/ctx-association-architecture.md`.
