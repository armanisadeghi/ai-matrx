---
status: active
updated: 2026-08-08
repos: [matrx-frontend]
vision: []                 # no standalone vision doc — Arman's words captured verbatim below
---

# Chat Options window — ui-dense overhaul

The "Chat Options" run-controls surface for one conversation: WindowPanel on desktop, iOS-style bottom sheet on mobile, opened from the chat composer's gear / `+` menu. Dense pass (phases 1–2) is DONE; what's left is the shared-component tabs (chips spawned) and any further enhancement Arman defines live.

## Vision — Arman's words

> "Update the 'Chat Options' Window Panel using this skill /ui-dense. Your first task is to merely get it updated as it is now but then, we are going to work together to enhance it and improve it in many ways." (2026-07-17)

Standing rulings that govern any future change here:
> - "Make sure everything lines up correctly." · "If the text wraps for something, shorten it, make the font smaller or adjust our split so things look nice."
> - Dropdown style: match the Model dropdown — no border/background, minimal padding.
> - Mobile: "this entire thing will need to switch to a bottom drawer that will render with an ios style concept."
> - Default tab: Quickset "for any caller, unless they modify it." (2026-07-18)
> - Sandbox tab: "absolutely no question about what, if anything is bound now, and a simple way to create a new one."
> - 2026-08-08 (general directive applied here): "If the ui has issues, let's just get them fixed" · obvious/easy fixes and focused features get spun off as chips; the core stays with the session Arman is in.

## Resources

- Core (tab defs + state + content router): `features/agents/components/inputs/smart-input/RunControlsTabPanel.tsx`
- Presentations: `features/window-panels/windows/agents/RunControlsWindow.tsx` (window + mobile `TabbedBottomSheet`), `RunControlsMenu.tsx` (trigger + fallbacks), `PlusAttachMenu.tsx` (Arman's `+` menu — don't fight it)
- Tab bodies: `QuicksetPanel.tsx` + `ShapeChipsRow.tsx` (same dir), `run-controls/{RunSettingsEditor,RunConfigOverrides,RunModelPicker,SurfaceSimulatorSelect}.tsx`, `chat/SandboxPanel.tsx`, `memory/components/AgentMemoryInlinePanel.tsx` (all under `features/agents/components/`)
- Opener: `features/overlays/openers/runControlsWindow.tsx` — `initialTab` omitted ⇒ Quickset (the contract)
- **Alignment law:** quickset rows share ONE `grid-cols-[9rem_minmax(0,1fr)]` label rail, defined in THREE synced places: `QuicksetPanel.Row`, `RunSettingsEditor.SettingsRow` (quickset variant), `SurfaceSimulatorSelect` (quickset prop). Triggers are borderless `bg-transparent px-1 text-xs h-7` (the ModelListDropdown trigger). Wide content (Shapes chips) breaks out of the rail as a full-width tag flow — don't cram chips into the control column.
- Skills: `ui-dense`, `overlay-system`, `window-panels`, `ios-mobile-first`
- History/what+why: `features/agents/components/chat/FEATURE.md` change log (2026-07-17, 2026-08-08 entries)
- Test: dev server → `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/chat` → composer `+` → "Advanced Settings Window" (or the gear in a conversation). Mobile 375px must be the bottom sheet. Use element refs, not coordinate clicks (coordinates mis-hit toggles).

## Remaining work

1. **Shared-component tabs** — spun off as chips 2026-08-08 (Arman launches them as focused sessions): RunToolPicker + RunSkillPicker dense pass; Chat Options surface-values/context-menu/Pro-input basics audit. If a chip was dismissed instead of run, the lane is still open: densify the shared component itself, never fork a variant. (ResourcePickerMenu densify: DONE — see Done.)
2. **Document tab** — `DocumentsWorkspace` (also a standalone panel) has had no dense pass; same rule: densify the component, all consumers benefit.
3. **Overrides rows** — `settings-management/controls/SettingControlInput.tsx` is shared with the agent builder; only touch with a global densify.
4. **Settings tab regrouping** — content was deliberately only condensed, never reorganized ("don't move or change anything yet"). Do it WITH Arman in-session, not solo.

## Done

- ResourcePickerMenu + all sub-pickers densified (2026-08-08): one shared `ResourcePickerSubViewHeader` (h-8, text-xs, icon/actions/disabled) replaced every hand-rolled `px-3 py-2 text-sm` header; all hardcoded gray/zinc/solid-brand colors → semantic tokens (works in dark mode); inputs/buttons h-8→h-7; rows py-2→py-1.5; text-[9px]→text-[10px]. Verified in `+` menu (desktop light+dark) and mobile 375px bottom-sheet Attach tab. Shared component — Attach tab, `+` menu, ResourcePickerWindow, ConversationInput, builder all benefit.
- Dense pass phases 1–2 shipped — commits `d3b16214e`, `66684ebe8`, `c8ff0b253`; full detail in `features/agents/components/chat/FEATURE.md`. Includes: label rail + borderless triggers, Context → `ActiveContextTree`, Overrides always-expanded, Memory → `AgentMemoryInlinePanel`, Sandbox one-line bound-state strip, mobile bottom sheet, Quickset default everywhere, Preferences tab deleted (duplicate toggle), Creator dense rows, Shapes chips full-width flow.
- Shapes chips kept (Arman's 2026-08-08 direction embraces content-IR shapes; `/shapes` is now a first-class route) — layout fixed, ownership stays with the content-IR campaign.
