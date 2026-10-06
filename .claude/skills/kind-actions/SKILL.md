---
name: kind-actions
description: "What a kind component (shape) can make happen: run a shortcut on an item, save results onto the item, open an agent, write to the page. Use when a shape needs an AI button, a result shown back in the item, runAction or itemState, or when someone says a shape can't trigger an agent."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/kind-actions/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# kind-actions — buttons in a shape that run AI and keep the result

A kind component (a "shape": agent-authored React stored in `content_ir.kind_component`) runs
sealed: no network, no data layer, no session. It still CAN make things happen. Everything that
leaves the component goes through **one prop, `runAction`**, and anything it saves comes back
through **one prop, `itemState`**. If you are about to tell someone "a shape can't trigger an
agent" — it can; read on.

## 1. What every component receives

```tsx
export default function Board({ data, kind, config, runAction, itemState }) { … }
```

| Prop | What it is |
|---|---|
| `data` | The item the agent produced (the `__kind` value). Read-only — never mutate it. |
| `kind`, `config` | The kind slug and the component row's config. |
| `runAction(key, input)` | The ONLY side-effect channel. Returns `Promise<{ok:true, result} \| {ok:false, error}>`. Never throws; the host shows errors and refuses a double-click. |
| `itemState` | This item's durable state: what actions saved onto it (`{}` when nothing yet). Survives reload. |
| `onResolve?`, `uiOptions?` | Only inside a Kind Request (a picker the page opened). Ignore otherwise. |

## 2. The actions

| `key` | Use it for | `input` | `result` |
|---|---|---|---|
| `run_shortcut` | Run AI on this item (the main one) | `{ shortcutId, scope?, variables?, userInput?, display?, expect?, saveAs?, label? }` | window: `{conversationId}` · background: `{data, saved}` (`saved:false` + `notSaved` when over 64 KB) |
| `save_item_state` | Keep something the person did or chose | `{ patch: { key: value } }` (`null` removes a key; 64 KB max) | `{saved: true}` |
| `trigger_agent` | Legacy: open an agent by id | `{ agentId, variables?, displayMode? }` | launch result |
| `apply_surface_write` | Write a value into the page around the shape (a field, an editor) | `{ target, value, origin?, item? }` | what was written |
| `list_surface_write_targets` | Ask which page fields accept writes | `{}` | target list |

**New components use `run_shortcut`, never `trigger_agent`.** A shortcut is the thing an
organization owns and can edit (agent + version + scope mappings + display), so the component
names WHICH job and hands it values; the job itself can be improved or rebound with no
component change.

`run_shortcut` input fields:
- `shortcutId` — the shortcut row (`agent.shortcut.id`). Put it in the component as a named
  constant at the top (`const VISUAL_BRIEF_SHORTCUT = "…"`), never inline.
- `scope` — values the shortcut's `scope_mappings` route to agent variables. Standard keys:
  `selection` (the focused piece, e.g. one idea as text), `content` (the whole item), plus any
  custom key the shortcut maps. Send TEXT the agent can read (a short markdown rendering of the
  idea), not the raw object.
- `variables` — direct values by agent variable name (merged over the mapped ones).
- `display` — `"window"` (default): opens the shortcut like a menu click, in its own window and
  chat. `"background"`: runs to completion, streaming into the floating live-run window, and
  returns its product.
- `expect` — `"json"` (default) returns the extracted structured value; `"text"` returns the
  answer text; `"image"` (an image-model shortcut) returns the generated image
  `{ file_id, mime_type, width, height, organization_id }`, and once saved the component gets it
  back with a displayable `src` — see [chains.md](chains.md).
- `saveAs` — a short key (`idea_3_brief`). Implies `"background"`. The HOST saves the product into
  `itemState[saveAs]` — even if the component unmounted mid-run — so the component simply renders
  `itemState.idea_3_brief` when present.
- `label` — words for the live window while it runs ("Writing the visual brief").

## 3. The three patterns — pick by where the answer belongs

| The answer… | Pattern | Call |
|---|---|---|
| is a conversation the person continues ("Develop this further") | **Open in window** | `runAction("run_shortcut", { shortcutId, scope })` |
| belongs on THIS item (a brief, a score, a rewrite) | **Fill a field** | `runAction("run_shortcut", { shortcutId, scope, saveAs: "idea_3_brief" })` → render `itemState.idea_3_brief` |
| needs two or more jobs in order (idea → brief → image) | **Chain** | await step 1 with `saveAs`, pass its product as step 2's `scope`, `saveAs` again — see [chains.md](chains.md) |

A pick the person makes without AI (a star, a choice, an edited caption) is
`save_item_state({ patch })`, rendered from `itemState`.

## 4. The button — use the kit, not a hand-rolled one

```tsx
import { KindActionButton } from "@/components/kind-kit/KindActionButton";

<KindActionButton
  runAction={runAction}
  action="run_shortcut"
  input={() => ({ shortcutId: VISUAL_BRIEF_SHORTCUT, scope: { selection: ideaText(idea) }, saveAs: `idea_${idea.number}_brief` })}
  label="Visual brief"
  confirm="Writes a detailed visual brief and uses credits."
/>
```

It gives you busy state, double-fire protection, the one-line error, and the consequence
confirm. For a chain of steps pass `run={() => …}` (returns the last step's envelope) instead of
`action` + `input`. A button that spends credits or creates something always passes `confirm`. In a
`KindPanel` "…" menu, call `runAction` from the menu item's `onSelect` instead.

## 5. Rules

- **Never** `fetch`, storage, or a client library — they are refused at save time. `runAction`
  is the door; a missing capability is a new host action (§6), never a workaround.
- **Never** name a raw agent id in a new component — `run_shortcut` with a shortcut id.
- **Never** write results into `data`; results live in `itemState`, keyed per piece
  (`idea_<number>_<what>`), so the original answer stays intact.
- Render the saved result in place, next to the piece it belongs to, and keep the button
  available to run again (re-running replaces the saved value).
- `{ok:false}` comes with a sentence for the reader — show it small beside the button (the kit
  button does); never swallow it.
- No shortcut exists for the job yet? Build the agent with the `create-agent` skill, then create
  the shortcut at `/agents/shortcuts/new` (agent, `scope_mappings` such as
  `{"selection": "<agent variable>"}`) and use its id.
- Where the item has no record (a preview, a dialog) `saveAs` and `save_item_state` refuse with
  a sentence; open-in-window still works.

## 6. Adding a new action (engineers)

The list grows by one handler file, never by a sandbox, compiler or prop change:
`matrx-frontend/features/content-ir/react/actions/handlers/<key>.ts` exporting a
`KindActionDefinition`, one line in `KIND_ACTIONS` (`kind-action-provider.ts`), the census test
in `features/content-ir/__tests__/kind-action-provider.test.ts`, and a row in §2 of this skill.
Anything the handler needs from the host is added to `KindActionContext`
(`kind-action-context.ts`) and bound in `useKindActionRunner.ts`.

## Companion files — read the one your run reaches

- Chaining jobs (idea → image prompt → image), showing a generated image, or the ready
  platform image shortcuts → [chains.md](chains.md)
- Proof for this skill → [evals.md](evals.md)
