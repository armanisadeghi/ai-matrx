# Agent Instance State Model — Rules vs Settings vs UI

> **Status:** Working draft (2026-06-24). Verified against the shortcut config bundle
> ([`agent-shortcuts/types.ts`](../redux/agent-shortcuts/types.ts)) and
> [`instance.types.ts`](../types/instance.types.ts). Some product decisions still open — see §5.
>
> **Why this doc exists:** every per-conversation field in the execution system is one of
> a few fundamentally different *kinds* of thing, and they got dumped into one slice
> ([`instance-ui-state.slice.ts`](../redux/execution-system/instance-ui-state/instance-ui-state.slice.ts))
> as if "UI state" covered all of them. It does not. Conflating a **creator rule** with a
> **user toggle** is both a correctness bug and a security hole. This is the canonical map.

---

## 1. The model: four kinds of thing, plus a permission tri-state

A field is exactly one **Category**:

| Category | Meaning | Who sets it | Can the user change it? |
|---|---|---|---|
| **Predefined (Rule)** | Creator-locked config that governs how the agent runs/displays. Comes from the agent/shortcut config bundle. | Creator (agent/shortcut) | **Never** (unless it explicitly grants a permission — see below) |
| **Creator Config (Setting)** | Advanced/admin knobs intentionally exposed to creators/admins for this run. | Creator/Admin | Only in creator/admin surfaces |
| **Wire/API** | Actually serialized onto the request to the server. | Various | n/a (it's an outbound value) |
| **UI Only** | Ephemeral client display state. No bearing on execution or security. | User | Freely |

> A field can be **Predefined *and* Wire** (e.g. `isBlockMode` is a creator rule that is also
> sent on the wire), or **Creator Config *and* Wire** (e.g. `maxIterations`). Category = its
> *primary nature*; the **Wire/API** column records whether it's serialized.

### The permission tri-state (the part that was missing)

Some **Rules are permission grants, not display booleans.** A single boolean cannot model
them. They require **three** separate pieces of state:

```
1. Permission   (Rule, creator-locked)   — is the user EVER allowed to see/do this?
2. User Toggle  (Setting, gated)          — the user's on/off CHOICE, only when permitted
3. Visible      (derived)                 — permitted && toggledOn
```

**Worked example — the variable panel:**

- Shortcut says **no variable panel** → `permission = false`. The user can never see it,
  cannot toggle it on, and — **critically** — the variable *values must never reach the
  client* (they are a secret of how that agent works).
- Shortcut **permits** the variable panel → `permission = true`. We then expose a
  **toggle** so the user can hide/show it (we reuse one runner UI everywhere; we don't
  want everything shown all the time). `visible = toggle`.

**The bug today:** `showVariablePanel` is a *single* boolean and the runtime actions
`setShowVariablePanel` / `toggleVariablePanel` mutate the **same** value the shortcut
locked. Permission and choice are not separable, and the values are snapshotted to the
client regardless of permission. The redesign must split this into permission + toggle +
derived-visible, and gate the values' delivery on permission.

Fields that need the tri-state: `showVariablePanel`, `hideReasoning`, `hideToolResults`
(creator can lock, or permit the user to toggle).

### Source of truth for Rules

The **persisted shortcut config bundle** is the definitive list of creator Rules —
[`agent-shortcuts/types.ts` `AgentShortcut` lines 86–112](../redux/agent-shortcuts/types.ts).
If a field is in that bundle, it is a creator Rule by definition. The Creator Hub →
**Widgets** tab (`runTabId: "widget_invoker"`) and the **Run/Settings** tabs are where
these come to life.

---

## 2. Verified categorization

Legend — **Category:** `Predefined` · `Creator Config` · `Wire/API` · `UI Only` ·
**Type:** `Rule` (creator-locked) · `Setting` (intentionally configurable) · `UI` (ephemeral) ·
**Perm** = has a permission layer · **Toggle** = user can flip when permitted ·
**Wire** = sent to server · **✅** confirmed / **❓** open.

| Field | Category | Type | Perm | Toggle | Wire | Notes | ✓ |
|---|---|---|:--:|:--:|:--:|---|:--:|
| `autoRun` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle | ✅ |
| `allowChat` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle | ✅ |
| `showPreExecutionGate` | Predefined | Rule | ✗ | ✗ | ✗ | + `preExecutionMessage`, `bypassGateSeconds` | ✅ |
| `displayMode` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle | ✅ |
| `variablesPanelStyle` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle | ✅ |
| `showVariablePanel` | Predefined | Rule | ✅ | ✅ if permitted | ✗ | **Split into permission + toggle. Values must NOT reach client if not permitted.** | ✅ |
| `hideReasoning` | Predefined | Rule | ✅ | ✅ if permitted | ✗ | Tri-state | ✅ |
| `hideToolResults` | Predefined | Rule | ✅ | ✅ if permitted | ✗ | Tri-state | ✅ |
| `showDefinitionMessages` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle (was missing from draft) | ✅ |
| `showDefinitionMessageContent` | Predefined | Rule | ✗ | ✗ | ✗ | In shortcut bundle (was missing from draft) | ✅ |
| `responseDensity` | Predefined | Rule (cosmetic) | ✗ | ❓ | ✗ | **In shortcut bundle = creator default.** Whether end-users may also flip density is a product call (§5). No secret. | ✅ cat |
| `jsonExtraction` | Predefined | Rule | ✗ | ✗ | client | **In shortcut bundle.** Consumed **client-side** by `process-stream` (activates `StreamingJsonTracker`); not a server field. | ✅ |
| `autoClearConversation` | Creator Config | Setting | ✗ | ✗ | ✗ | NOT in shortcut bundle — instance/builder-level | ✅ |
| `reuseConversationId` | Creator Config | Setting | ✗ | ✗ | ✗ | Dormant — likely the original "stable conversation id" mechanism, now unwired | ✅ |
| `serverOverrideUrl` | Creator Config | Setting | ✗ | ✗ | ✗ | Admin testing only; local backend routing (+ paired auth token) | ✅ |
| `debug` (debugMode) | Creator Config | Setting | ✗ | ✗ | ✅ `debug` | `builderAdvancedSettings.debug` | ✅ |
| `store` (saveToDB) | Creator Config | Setting | ✗ | ✗ | ✅ `store` | `builderAdvancedSettings.store`; `store:false` = ephemeral | ✅ |
| `maxIterations` | Creator Config | Setting | ✗ | ✗ | ✅ | `builderAdvancedSettings.maxIterations` (default 100) | ✅ |
| `maxRetriesPerIteration` | Creator Config | Setting | ✗ | ✗ | ✅ | `builderAdvancedSettings.maxRetriesPerIteration` (default 2) | ✅ |
| `structuredInstruction` | Creator Config | Setting | ✗ | ✗ | ✅ | `builderAdvancedSettings.*`; single-run, gated by `useStructuredSystemInstruction`; → `system_instruction` | ✅ |
| `disableToolInjection` | Wire/API | Rule | ✗ | ✗ | ✅ | `builderAdvancedSettings.disableToolInjection` — omits `client.surface` | ✅ |
| `surfaceOverride` (surfaceSimulator) | Creator Config | Setting | ✗ | ✗ | ✅ `client.surface` | `builderAdvancedSettings.surfaceOverride` — Surface Simulator; creator mimics any surface | ✅ |
| `addedTools` | Creator Config | Setting | ✗ | ✗ | ✅ `tools` | `builderAdvancedSettings.addedTools` — tools the user added this conversation | ✅ |
| `isBlockMode` | Wire/API | Rule | ✗ | ✗ | ✅ `block_mode` | **Global** slice-root flag today (admin) | ✅ |
| `isSnapshot` | Wire/API | Rule | ✗ | ✗ | ✅ `snapshot` | **Global** slice-root flag today (admin) | ✅ |
| `observationalMemory` / `memoryThisConversation` | Wire/API | Rule | ✗ | ✗ | ✅ `memory`/`memory_model`/`memory_scope` | One-shot toggle; **global** slice-root today (admin) | ✅ |
| `modelOverride` / `modelSettingsOverrides` | Wire/API | Setting | ✗ | ✗ | ✅ `config_overrides` | Lives in the separate `instance-model-overrides` slice | ✅ |
| `isExpanded` | UI Only | UI | ✗ | ✅ | ✗ | | ✅ |
| `showAttachments` | UI Only | UI | ✗ | ✅ | ✗ | | ✅ |
| `showMicrophone` | UI Only | UI | ✗ | ✅ | ✗ | | ✅ |
| `showFreeformInput` / `showUserMessageOptions` / `showAssistantMessageOptions` / `submitOnEnter` / `inputPlaceholder` | UI Only | UI | ✗ | ✅ | ✗ | Same family as attachments/mic | ✅ |
| `modeState` | UI Only | UI | ✗ | ✗ | ✗ | Per-display-mode transient runtime bag (e.g. chat-assistant heartbeat interval); reset on `displayMode` change | ✅ |
| `detectedContext` | — (computed) | — | — | — | ✅ `client.surface` | **Not stored state.** The route-detected `ui_surface.name`, computed at `buildToolInjection`; `surfaceOverride` overrides it | ✅ |

### Changes from the original draft
- `responseDensity` → **Predefined** (it's in the shortcut config bundle), not unresolved.
- `jsonExtraction` → **Predefined**, consumed **client-side** by `process-stream` (not a server field).
- `surfaceSimulator` → it's `builderAdvancedSettings.surfaceOverride`; **Creator Config**, Wire (`client.surface`).
- `detectedContext` → not a stored field; it's the auto-detected `client.surface`.
- `modeState` → **UI Only** (per-display-mode transient bag).
- Added `showDefinitionMessages` / `showDefinitionMessageContent` (Predefined Rules, in the bundle) and the `showFreeformInput`-family UI fields, which the draft omitted.

---

## 3. Where each kind should live (target)

- **Rules (Predefined):** an **immutable, read-only snapshot** on the instance, taken once
  at creation from the agent/shortcut config bundle. The UI never mutates these. Permissions
  are *derived* from them.
- **Permissions:** derived selectors over the Rule snapshot (`canSeeVariables`,
  `canToggleReasoning`, …). Not stored.
- **User toggles (Settings, gated):** a small, separate mutable bag, every write guarded by
  the corresponding permission.
- **UI Only:** ephemeral display bag — the only thing that should change frequently and the
  only "UI state" that name actually fits.
- **Wire/API:** assembled at **execute time** in `assembleRequest` (it mostly already is) —
  read, not subscribed by the view.
- **Global admin flags** (`isBlockMode`, `isSnapshot`, memory): leave the per-conversation
  slice entirely; they are session/admin globals.

---

## 4. Why this drives the re-render fix

The runner re-renders ~5× per launch because it **subscribes** to ~9 of these as if they
were live data. Almost none of them are: Rules are fixed at creation, Wire values are read at
execute time, and only a handful (messages, stream phase, status, user input, the few UI
toggles) ever legitimately change while the panel is open. Once Rules are a read-once
snapshot and Wire config is execute-time-only, the runner's *subscription surface* collapses
to the genuinely-live set — which is the real cure, on top of atomic instance creation and a
stable conversation id.

---

## 5. Open product decisions
1. `responseDensity` — creator default only, or may end-users also flip it (cosmetic)?
2. Which Rules, beyond `showVariablePanel`/`hideReasoning`/`hideToolResults`, are meant to be
   *permission grants* (creator may optionally let the user toggle) vs hard locks?
3. Secret variable values: confirm the target is **server-side suppression** (don't send
   hidden variable defs/values to the client at all) — this needs an aidream change, not just FE.
