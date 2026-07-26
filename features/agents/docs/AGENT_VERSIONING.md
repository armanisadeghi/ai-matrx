# AGENT_VERSIONING.md

**Status:** `active`
**Tier:** 1 (sub-feature of `features/agents/`)
**Last updated:** `2026-04-22`

> **Platform versioning source of truth:** `common-docs/systems/versioning/` (`/Volumes/Samsung2TB/code/matrx-common-docs/systems/versioning/`). This doc is the repo-specific AGENT implementation on top of that standard; if they conflict, the common-docs set wins.
>
> Read [`features/agents/FEATURE.md`](../FEATURE.md) first. This is the load-bearing contract that lets Shortcuts and Agent Apps stay stable while agents evolve.

---

## Purpose

Every time an engineer saves in the Builder, a new `agent_definition` version row is written. The "current" agent is a pointer to one of these versions. Consumer surfaces choose between tracking the current pointer or pinning to a specific version. **Shortcuts and Agent Apps pin by default** — they're embedded in running products and their variable shape cannot change out from under them.

---

## The three consumption modes

| Mode | Who uses it | How |
|---|---|---|
| **Track current** | Chat, Builder, Runner (default) | `engine.isVersion = false`. Invocation hits the live agent pointer. Changes with every new save. |
| **Pin to version** | Shortcuts, Agent Apps (default), Runner (explicit) | `engine.isVersion = true` + `agentVersionId` set. Server loads that specific version row. Frozen until the pin is updated. |
| **Use latest, but remember we're pinned** | Shortcut / App configured with `useLatest: true` | Pointer-tracking but owned by a pinned consumer record. Rare; used when the engineer trusts drift. |

---

## What "save" actually does

1. Engineer edits fields in Builder — `isDirty` becomes true; field-level undo stack fills.
2. Engineer clicks Save.
3. Server writes a new row into `agent_definition` (or equivalent versions table) with all fields from the Builder payload.
4. The current pointer is moved to the new row.
5. `isDirty` clears; the new version ID becomes the active edit target.

**There is no in-place overwrite.** Every save is additive. Drafting is handled by not saving — the Builder maintains dirty state locally until the engineer commits.

---

## Drift detection & surfacing

When a Shortcut or App is pinned to version `v3` and the agent advances to `v7`, the consumer is **drifted**. The system:

1. Does **not** auto-update the pin. Silently updating would break variable mappings.
2. Surfaces drift in the admin UI (version badge, "update available" indicator).
3. Lets the engineer review what changed and update the pin on demand.

The engineer's explicit action is the only thing that moves a pinned consumer forward.

---

## Why this matters

A Shortcut embedded in a flashcard module maps variables like:

```
{ focus: flashcard.front, subject_context: session.cards[-5:], action: "explain", ... }
```

If the agent's `action` enum changes or `focus` is renamed to `current_item`, every invocation in production silently breaks. Version-pinning freezes the contract; drift detection lets engineers roll forward deliberately.

**The cost** is that a saved Shortcut always uses the version it was pinned to. Updating means reviewing + explicitly advancing the pin.

---

## Key flows

### Flow 1 — Engineer saves a Builder edit

1. Builder state is dirty.
2. Save dispatch → thunk writes new version row → pointer advances.
3. Runner and Chat consumers pick up the new version on their next request.
4. Every Shortcut / App pinned to an earlier version is flagged as drifted in the admin UI.

### Flow 2 — Engineer updates a pinned Shortcut

1. Admin opens the Shortcut. System shows it's pinned to `v3`, current is `v7`.
2. Admin reviews variable changes between `v3` and `v7`.
3. Admin updates the pin (`agentVersionId = v7`).
4. Shortcut's scope mappings are revalidated against `v7`'s variable list; breakages are flagged.
5. Save.

### Flow 3 — Runner pins a past version for testing

1. Engineer opens Runner on current agent (`v7`).
2. Selects `v3` in version selector.
3. Invocation fires with `engine.isVersion = true` + `agentVersionId: v3`.
4. Server loads `v3` and runs it exactly as saved.
5. UI clearly flags that the Runner is on a pinned version, not current.

---

## Invariants & gotchas

- **Every Builder save = new version.** Do not design flows that mutate a version in place.
- **Pinned consumers do not auto-update.** Silent auto-update is an anti-goal; drift detection is the UX contract.
- **Variable name stability is load-bearing for pinned consumers.** If you rename or remove a variable, every pin must be reviewed.
- **`useLatest: true` on a Shortcut is rare and risky.** Document the reason when you set it.
- **Server must load the version row, not the current pointer, when `engine.isVersion = true`.** Getting this wrong silently degrades pinned Shortcuts/Apps to current behavior.
- **Runner pin is ephemeral** — leave the Runner, lose the pin. It's a testing aid, not a saved setting.

---

## Related

- [`AGENT_BUILDER.md`](./AGENT_BUILDER.md) — where saves happen
- [`AGENT_RUNNER.md`](./AGENT_RUNNER.md) — ad-hoc pin for testing
- `features/agent-shortcuts/FEATURE.md` — default-pinned consumer
- `features/agent-apps/FEATURE.md` — default-pinned consumer

---

## Change log

- `2026-04-22` — claude: initial doc. Extracted from `agent-system-mental-model.md` §1 (Versioning) and the Shortcut/App type definitions.

---

> **Keep-docs-live:** any change to version semantics, drift detection, or the `engine.isVersion` contract must update this doc AND `AGENT_INVOCATION_LIFECYCLE.md`.
