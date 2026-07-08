---
status: active
updated: 2026-07-07
repos: [matrx-frontend]
vision: []
---

# Surfaces — bindings replacement + remaining waves

Every UI declares itself as a **surface** (code-first manifests in
`features/surfaces/manifests/*.manifest.ts`, mirrored to `ui_surface`/`ui_surface_value`); pages
emit live values via `buildScope()`; agents consume them at launch. The system's living doc is
`features/surfaces/FEATURE.md`.

**The ground has shifted:** the binding mechanism this work was built on —
`agx_agent_surface.value_mappings` — was **condemned 2026-07-02** (see the "⛔️ CONDEMNED" section
in `features/surfaces/FEATURE.md`). It is slated for deletion in favor of `platform.associations`;
its write paths fire `console.error` beacons. Do not extend it.

## Vision — Arman's words

- **Surface inheritance APPROVED** (2026-07-07): "Yes! This one is huge! Approved!" — parent/child
  surfaces per `docs/handoffs/SURFACE_INHERITANCE_PROPOSAL.md`, re-scoped: values/roles/config
  inheritance (v1) on top of the association-based bindings; the proposal's binding-cascade section
  is dead with the condemned mechanism.
- Verification standard — the owner's favorite context test: put "Matrx is the product name (not
  matrix)" in context, feed text containing "matrix", check the output spells "Matrx".
- Recovery layers must be LOUD (console.warn/error + toast) — a silently-skipped binding is how
  the org-tier bug survived.

## Resources

- FEATURE doc (incl. the CONDEMNED section): `features/surfaces/FEATURE.md`
- Skills: `canonical-associations` (mandatory for item 1), `context-docs` (for item 5)
- Launch chain: `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts`,
  merge engine `features/surfaces/utils/merge-value-mappings.ts`
- Roles/config runtime: `features/surfaces/{services/surface-config.service.ts,redux/surfaceConfigSlice.ts,hooks/}`
- Reference consumer (end-to-end): `features/transcription-cleanup/` (`/transcripts/cleanup`)
- Drift gate: `pnpm check:surface-drift` · DB forensics: `cx_conversation.variables` shows what an
  agent actually received

## Remaining work

1. **Replace agent↔surface binding with `platform.associations`.** The condemned
   `agx_agent_surface.value_mappings` store must be migrated to the canonical association system,
   then deleted (DB + FE write/read paths). Invoke the `canonical-associations` skill; the
   condemned write paths already scream via console.error beacons — silence them by deletion, not
   suppression.
2. **Wave 5 — user hub `/surfaces`** (not built): `app/(core)/surfaces/{layout,page}.tsx` +
   `[...name]/page.tsx`; list = active matrx-user surfaces with ≥1 role or config namespace;
   detail = Me|Org scope switcher + Roles/Dictionary/ConfigForm/Tools (settings primitives from
   `components/official/settings`; persistence via `surface-config.service.ts`, NOT `useSetting`).
3. **Wave 6 — transcript-scribe manifest** (not done): write
   `features/surfaces/manifests/transcript-scribe.manifest.ts` (`assistant` role, default =
   `AUDIO_ASSISTANT_AGENT_ID` in `features/transcript-studio/constants.ts`), then migrate
   `scribeAssistantAgentId` out of `lib/redux/slices/userPreferencesSlice.ts:373` and rewire
   `assistantRoster.resolveDefaultAssistantAgentId`.
4. **Wave 7 — surface-registration skill** (absent): the layered recipe (values → roles/namespaces
   → registry+drift → DB sync → emitter → verification incl. the Matrx-vs-matrix test), with
   transcripts-cleanup as the worked example. Unblocks the all-surfaces sweep (~100 surfaces).
5. **Surface inheritance v1 (APPROVED — after item 1):** `inheritsFrom` on `SurfaceManifest` +
   parent layer at the bottom of the existing merge engines (`withInjectedBaselines`,
   `mergeValueMappingLayers`) for values/roles/config. Design:
   `docs/handoffs/SURFACE_INHERITANCE_PROPOSAL.md` (its binding-cascade section is dead — bindings
   cascade lands with/after the associations replacement).
6. **`features/surfaces/FEATURE.md` documentation gap:** roles, config namespaces, and the
   full-screen admin editor are undocumented. Use the `context-docs` skill.

## Done

- Wave 4 admin full-screen editor — `app/(admin)/administration/surfaces/[...name]/page.tsx`.
- `url_pattern` sync (2026-07-02) — manifest-sync service.
- Batch bindings editor — surfaces admin.
- Reference consumer registered end-to-end — `features/transcription-cleanup/`.
