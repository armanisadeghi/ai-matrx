---
status: active
updated: 2026-07-12
repos: [matrx-frontend]
vision: []
---

# Surfaces — bindings replacement + remaining waves

Every UI declares itself as a **surface** (code-first manifests in
`features/surfaces/manifests/*.manifest.ts`, mirrored to `ui_surface`/`ui_surface_value`); pages
emit live values via `buildScope()`; agents consume them at launch. The system's living doc is
`features/surfaces/FEATURE.md`.

Bindings are canonical `platform.associations` edges (agent → surface, tier-encoded `role`,
payload in metadata) as of 2026-07-12 — the condemned `agent_surface` mechanism is deleted.
See "Agent↔surface bindings — canonical model" in `features/surfaces/FEATURE.md`.

## Vision — Arman's words

- **Surface inheritance APPROVED** (2026-07-07): "Yes! This one is huge! Approved!" — shipped
  2026-07-12 (values/roles/config + binding cascade); design section now lives in
  `features/surfaces/FEATURE.md` → "Surface inheritance (v1)".
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
## Done

- **Bindings → `platform.associations` (2026-07-12):** junction migrated count-verified +
  graveyarded, condemned service/beacons deleted, all FE paths on
  `bind-agent-to-surface.service.ts` / `agent.menu_surface`; Diagram Editor ↔ mermaid-editor
  edge seeded. (`migrations/agent_surface_to_associations.sql`)
- **Surface inheritance v1 (2026-07-12):** `inheritsFrom` + registry merge (values/roles/config,
  loud cycle/depth guards) + binding cascade + manifest-sync `parent_surface_name` mirror; live
  families: transcripts ⊃ cleanup, pdf-extractor ⊃ chunker/analysis-studio/scanner.
- **FEATURE.md doc gap closed (2026-07-12):** canonical binding model, inheritance, roles,
  config namespaces, and the full-screen admin editor documented.
- Wave 4 admin full-screen editor — `app/(admin)/administration/surfaces/[...name]/page.tsx`.
- `url_pattern` sync (2026-07-02) — manifest-sync service.
- Batch bindings editor — surfaces admin.
- Reference consumer registered end-to-end — `features/transcription-cleanup/`.
