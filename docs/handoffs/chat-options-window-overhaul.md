---
status: blocked            # remaining lanes are all gated on Arman's answers below
updated: 2026-07-18
repos: [matrx-frontend]
vision: []                 # no standalone vision doc — Arman's words captured verbatim below
---

# Chat Options window — ui-dense overhaul

The "Chat Options" run-controls surface for one conversation: a WindowPanel on desktop, an iOS-style bottom sheet on mobile, opened from the chat composer's gear / `+` menu. Phase 1 (densify as-is) is DONE and committed; phase 2 (enhance/improve) was never specified and is gated on Arman.

## Vision — Arman's words

Phase 1 brief (2026-07-17):
> "Update the 'Chat Options' Window Panel using this skill /ui-dense. Your first task is to merely get it updated as it is now but then, we are going to work together to enhance it and improve it in many ways."

> "For the tabs where the internal component is one being used by many other routes, leave those and at the end of each turn, you'll give me a list of them and then we'll decide how to fix them."

Per-tab rulings:
> - Context: "replace with the new canonical one we have that is much more concise. Used in the chat header." *(= `ActiveContextTree`, the lens-chip picker — done)*
> - Overrides: "Show advanced settings directly without requiring a click."
> - Sandbox: "It's very poorly done, WAY TOO wordy and incredibly complicated to figure out what is actually active. Simplify it to just show what's available, absolutely no question about what, if anything is bound now, and a simple way to create a new one. Get rid of the complexities."
> - Memory: "it should render the same thing the memory window panel but in a manner that makes sense for this ui."
> - Settings: "Just use the skill and condense but don't move or change anything yet."
> - Others: "keep as they are for now and report remaining ones at the next turn."

Style rulings:
> "Notice that the Model selection dropdown doesn't have a border or background and that it doesn't have a ton of padding. Update all others to match." · "Make sure everything lines up correctly." · "If the text wraps for something, shorten it, make the font smaller or adjust our split so things look nice." · "On mobile, this entire thing will need to switch to a bottom drawer that will render with an ios style concept."

Follow-ups (2026-07-18):
> "When you activate this from the smart Agent input… it goes to the quickset tab. That should be the default behavior for any caller, unless they modify it." · Model picker count badge: "It's a silly thing to have on a model picker" (removed). · On the Quickset "Shapes" row: "I honestly don't even know what that is" — it came from another session (commit `798a80712`, content-IR shape-discovery chips); Arman has not ruled on keeping it.

## Resources

- Core (tab defs + state + content router): `features/agents/components/inputs/smart-input/RunControlsTabPanel.tsx`
- Presentations: `features/window-panels/windows/agents/RunControlsWindow.tsx` (desktop window + mobile `TabbedBottomSheet`), `features/agents/components/inputs/smart-input/RunControlsMenu.tsx` (trigger + popover/sheet fallbacks), `PlusAttachMenu.tsx` (the `+` menu, reworked separately by Arman — don't fight it)
- Tab bodies: `QuicksetPanel.tsx` (same dir), `run-controls/{RunSettingsEditor,RunConfigOverrides,RunModelPicker,SurfaceSimulatorSelect}.tsx`, `chat/SandboxPanel.tsx`, `memory/components/AgentMemoryInlinePanel.tsx` (all under `features/agents/components/`)
- Opener: `features/overlays/openers/runControlsWindow.tsx` — `initialTab` omitted ⇒ Quickset (the contract; don't re-add per-caller defaults)
- **Alignment law:** quickset-style rows share ONE `grid-cols-[9rem_minmax(0,1fr)]` label rail, defined in THREE places that must stay in sync: `QuicksetPanel.Row`, `RunSettingsEditor.SettingsRow` (quickset variant), `SurfaceSimulatorSelect` (quickset prop). Trigger style = the `ModelListDropdown` trigger: borderless, `bg-transparent px-1 text-xs h-7`.
- Skills to invoke: `ui-dense` (+ its shared ground-rules/anchors docs), `overlay-system`, `window-panels`, `ios-mobile-first`
- Docs: `features/agents/components/chat/FEATURE.md` (2026-07-17 "Chat Options densified" entry has the full what/why)
- Test: dev server, then `http://localhost:<port>/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/chat` → click the composer's `+` → "Advanced Settings Window" (or the gear in a conversation). Mobile: resize to 375px — must be the bottom sheet, never a window. Beware: coordinate clicks in the browser tools can mis-hit toggles (use element refs).

## Remaining work

1. **Get phase-2 scope from Arman** (see Decisions). Do not invent enhancements — he explicitly said "we are going to work together" on that phase.
2. **Shared-component tabs, deliberately untouched** — each is consumed by other surfaces, so densifying means either (a) restyling the shared component everywhere or (b) adding a compact variant prop. Needs Arman's per-tab call:
   - Attach → `features/resource-manager/resource-picker/ResourcePickerMenu.tsx` (also the `+` menu)
   - Document → `working-document/documents-workspace/DocumentsWorkspace.tsx` (also a standalone panel)
   - Tools → `smart-input/RunToolPicker.tsx` · Skills → `smart-input/RunSkillPicker.tsx` (both also inside Quickset popovers)
   - Overrides rows → `settings-management/controls/SettingControlInput.tsx` (shared with agent builder)
3. **Preferences tab** — still a single "Submit on Enter" toggle (duplicated in Quickset). Obvious fold-into-Settings candidate, but that's a structure change Arman deferred ("don't move or change anything yet").
4. **Creator tab** — three large icon-rows (Creator panel / Debug / Preview prompt); not yet on the dense row style.
5. **Settings tab reorganization** — only condensed so far per instruction; grouping/ordering rethink is phase-2 material.

## Done

- Phase-1 dense pass shipped — commits `d3b16214e`, `66684ebe8`; details in `features/agents/components/chat/FEATURE.md` (2026-07-17 entry). Covers: shared 9rem label rail + borderless triggers, Context → `ActiveContextTree`, Overrides always-expanded, Memory → `AgentMemoryInlinePanel` (reuses the Memory window's hook/views — cannot drift), Sandbox rewritten to one-line bound-state strip + list + New (logic unchanged), Quickset dedup + lens chip, mobile `TabbedBottomSheet`, Quickset as universal default tab, model-picker trigger badge removed.

## Decisions needed (Arman)

1. **Situation:** Six Chat Options tabs render components shared with other surfaces (Attach, Document, Tools, Skills, the Overrides setting rows, the model dropdown panel), so they were left un-densified. **Decide:** per tab — restyle the shared component globally, add a compact/dense variant used only here, or leave as-is.
2. **Situation:** Quickset has a "Shapes" row (one-click chips adding the Flashcards/Quiz/Timeline/Comparison/Diagram render-block skills), added by a parallel session; you said you didn't recognize it. **Decide:** keep it in Quickset, fold it inside the Skills picker, or remove it.
3. **Situation:** Phase 2 ("enhance and improve it in many ways") was never specified. **Decide:** what the enhancements are — e.g. Preferences fold-in, Settings regrouping, Creator densify, anything new.
