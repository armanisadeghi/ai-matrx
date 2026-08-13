# P9 — Coming-soon compliance patrol

**Run:** 2026-08-13 00:35 PDT
**Repository:** `/Users/armanisadeghi/.codex/worktrees/e397/matrx-frontend`
**Base commit:** `01cb3bed4`
**Pass:** first run / required full pass
**Tier:** M for clear registry + handler wiring; R for ambiguous disabled/static surfaces
**Final batch state:** **INFRASTRUCTURE BLOCKED** — corrected diff preserved; not released

## Immutable baseline

- Worktree isolation: dedicated Codex worktree, clean before mutation.
- Dependencies: worktree-local `pnpm install --offline --frozen-lockfile` completed; no dependency changes.
- `pnpm type-check`: PASS.
- Dedicated P9 static gate: absent.
- Case-insensitive runtime TS/JS literal scan outside `lib/coming-soon/**`: **105 files / 165 lines**.
- Registered backlog: **33** registry entries.
- Managed preview: lease owned by `/Users/armanisadeghi/code/matrx-frontend`, not this worktree.

## Scope scanned

Because the prior report was absent, this run performed the required first/full pass:

```sh
rg -i -n --glob '*.{ts,tsx,js,jsx}' --glob '!lib/coming-soon/**' 'coming soon' .
rg -i -n --glob '*.{ts,tsx,js,jsx}' --glob '!lib/coming-soon/**' 'toast\\.(info|success|warning|error)\\([^\\n]*coming[ -]?soon' .
rg -n --glob '*.{ts,tsx,js,jsx}' 'announceComingSoon|getComingSoon|listComingSoon' .
```

The open sightings ledger contained no prior P9 sighting. Structural-novelty comparison was unavailable because this was the first report, so the full pass establishes the next run's route/feature baseline: **1,004 route page leaves** and **121 top-level feature directories**.

## Routed report

### Auto-fixed now — corrected diff preserved, certification incomplete

**10 verified promise cases / 14 handler occurrences** use the approved existing primitive. Nine new registry rows were added; `agents.save-as-template` reused its existing row.

1. `agents.save-as-template` — `features/agents/components/agent-listings/AgentListItem.tsx:183`.
2. `rich-document.convert-to-broker` — rich-document, authenticated-chat, and public-chat action handlers.
3. `chat.add-to-docs` — authenticated-chat and public-chat action handlers.
4. `image-studio.smart-crop` — capability guard and 404 fallback.
5. `image-studio.edit-suggestions` — disabled-capability action.
6. `image-studio.prompt-edit` — disabled-capability action.
7. `image-studio.suggest-annotations` — annotate-mode action.
8. `image-studio.pii-redaction` — annotate-mode action.
9. `image-studio.face-detection` — disabled-capability action.
10. `education.premium-checkout` — Stripe 503 fallback.

All six existing-but-gated Image Studio controls and Education checkout are `blocked` with explicit `blockedBy`; planned chat/document promises remain `planned`.

### Manual approval requested

1. `features/image-studio/modes/edit/EditAiToolbar.tsx:348` — after suggestions eventually run, the success toast promises a future one-click apply action. Why it matters: it creates a second untracked promise after the registered suggestions promise. Safe fix: register `image-studio.apply-suggestion` and replace the promise-language success outcome with `announceComingSoon` (or build the apply action). Approval is requested because the desired post-suggestion interaction is a product choice.
2. `features/whatsapp-clone/chat-view/MessageInputAttachMenu.tsx:62` — the Camera attachment action emits a bare coming-soon toast. Why it matters: the promise is user-triggerable and absent from the registry. Safe fix: register `whatsapp.camera-attachment` and call `announceComingSoon` from the existing click branch. Approval is requested because this demo/clone surface may be intentionally disposable.

No exception is proposed or approved.

### Backlog retained — missing rendered-context evidence or product decision

The other **99 post-batch detector files** remain open detector candidates. They mix comments/types, registry-backed marketing/status consumers, static placeholder pages, badges, tooltips, disabled controls, and stub modals. The scan alone cannot safely decide whether to register an actionable promise, replace a display with registry-derived copy, build the feature, or delete a stale fallback. They require stable route/reproduction evidence and per-surface ownership decisions; no suppression or exception was added.

- `app/(admin)/administration/ui/official-components/component-displays/advanced-menu.tsx`
- `app/(core)/files/activity/page.tsx`
- `app/(core)/files/requests/page.tsx`
- `app/(core)/files/starred/page.tsx`
- `app/(core)/images/generate/GenerateShellClient.tsx`
- `app/(core)/marketing/admin/page.tsx`
- `app/(core)/podcast/studio/create-a/_components/CreateViewA.tsx`
- `app/(core)/podcast/studio/create-b/_components/ComposerForm.tsx`
- `app/(core)/podcast/studio/create-c/_components/source-data.ts`
- `app/(core)/podcast/studio/create-f/_mock/options.ts`
- `app/(core)/transcripts/new/page.tsx`
- `app/(dev)/demos/tests/slack/with-brokers/page.dev.tsx`
- `app/(public)/free/zip-code-heatmap/components/ViewModeSelector.tsx`
- `app/(public)/seo/page.tsx`
- `components/coming-soon/ComingSoonBadge.tsx`
- `components/coming-soon/ComingSoonInline.tsx`
- `components/guest/SignupConversionModal.tsx`
- `components/image/cloud/CloudFilesBrowserTable.tsx`
- `components/mardown-display/blocks/math/MathProblemBlock.tsx`
- `components/mardown-display/blocks/presentations/PresentationExportMenu.tsx`
- `components/mardown-display/chat-markdown/matrx-variables/MatrxVariableInline.tsx`
- `components/official/ImageAssetUploader.tsx`
- `components/official/card-and-grid/Grid.tsx`
- `components/official/item/types.ts`
- `components/official/unified-list/UnifiedFilterModal.tsx`
- `features/admin/components/FeatureAdminPage.tsx`
- `features/admin/types/featureAdminMap.ts`
- `features/administration/database-admin/functionDetails.tsx`
- `features/agent-comparison/shared/ModePicker.tsx`
- `features/agent-connections/components/sections/HooksSection.tsx`
- `features/agent-connections/components/sections/SubAgentsSection.tsx`
- `features/agents/agent-creators/interactive-builder/ComprehensiveBuilder.tsx`
- `features/agents/agent-creators/tabbed-builder/MainPromptBuilder.tsx`
- `features/agents/browse/agentActionRegistry.tsx`
- `features/agents/browse/components/AgentBrowseCards.tsx`
- `features/agents/components/agent-listings/ComingSoonModal.tsx`
- `features/agents/components/coming-soon/AgentComingSoonContent.tsx`
- `features/agents/components/shared/AgentOptionsMenu.tsx`
- `features/agents/components/shell/AgentBuildSidebarExtras.tsx`
- `features/agents/components/tools-management/AgentToolsManager.tsx`
- `features/agents/import/AgentImportWindow.tsx`
- `features/agents/import/import-types.ts`
- `features/ai-models/audit/ModelAuditDashboard.tsx`
- `features/auth/components/module-landing/ModuleLanding.tsx`
- `features/auth/components/module-landing/landings/AgentAppsLanding.tsx`
- `features/auth/components/module-landing/landings/AgentsLanding.tsx`
- `features/auth/components/module-landing/landings/ChatLanding.tsx`
- `features/auth/components/module-landing/landings/DocumentsLanding.tsx`
- `features/auth/components/module-landing/landings/FilesLanding.tsx`
- `features/auth/components/module-landing/landings/MessagesLanding.tsx`
- `features/auth/components/module-landing/landings/NotesLanding.tsx`
- `features/auth/components/module-landing/landings/SandboxesLanding.tsx`
- `features/auth/components/module-landing/landings/TasksLanding.tsx`
- `features/auth/components/module-landing/landings/TranscriptsLanding.tsx`
- `features/auth/components/module-landing/landings/VoiceLanding.tsx`
- `features/auth/components/module-landing/landings/WorkbooksLanding.tsx`
- `features/cms/utils/__tests__/contentVolume.test.ts`
- `features/cms/utils/contentVolume.ts`
- `features/code/views/PlaceholderPanel.tsx`
- `features/cx-chat/components/sidebar/SidebarActions.tsx`
- `features/education/components/ExamCuratedLibrary.tsx`
- `features/education/components/landing/EducationHub.tsx`
- `features/education/components/sections/StatusPill.tsx`
- `features/education/convert/ConvertContentDialog.tsx`
- `features/education/convert/generators/index.ts`
- `features/education/data/tools.ts`
- `features/education/family/components/FamilyDashboard.tsx`
- `features/education/family/components/GuardianConsentVerifyDialog.tsx`
- `features/education/media/audio/audioGenerator.ts`
- `features/education/onboard/import/importAnki.ts`
- `features/files/components/surfaces/FileTabsBody.tsx`
- `features/files/components/surfaces/desktop/BulkActionsBar.tsx`
- `features/files/components/surfaces/desktop/EmptyState.tsx`
- `features/files/components/surfaces/desktop/FileGridCell.tsx`
- `features/files/components/surfaces/desktop/FileTableRow.tsx`
- `features/files/components/surfaces/desktop/IconRail.tsx`
- `features/files/components/surfaces/desktop/NavSidebar.tsx`
- `features/files/components/surfaces/single-file/FileViewerControlRail.tsx`
- `features/flashcards/fast-fire/components/FastFireSetup.tsx`
- `features/image-manager/components/AIGenerateHero.tsx`
- `features/image-studio/constants/backend-capabilities.ts`
- `features/legal/components/landing/LegalLanding.tsx`
- `features/marketing/components/MarketingHub.tsx`
- `features/marketing/components/media/SiteVideosView.tsx`
- `features/marketing/lib/marketing-nav.ts`
- `features/notes/components/mobile/NotesFilterSheet.tsx`
- `features/organizations/peek/registry.ts`
- `features/podcasts/components/player/PodcastEpisodePage.tsx`
- `features/pricing/education/EducationPricing.tsx`
- `features/public-chat/components/PublicMessageOptionsMenu.tsx`
- `features/research/components/document/DocumentViewer.tsx`
- `features/resource-manager/resource-picker/ResourcePickerMenu.tsx`
- `features/rich-document/actions/handlers/stubs.ts`
- `features/settings/pages/IntegrationsSettingsPage.tsx`
- `features/settings/tabs/PlaceholderTab.tsx`
- `features/sharing/components/tabs/ShareWithOrgTab.tsx`
- `features/shell/constants/nav-data.ts`
- `features/surfaces/manifests/image-edit.manifest.ts`
- `features/surfaces/manifests/marketing.manifest.ts`

## Verification and certification

Post-edit checks on the frozen 10-file batch:

- `pnpm type-check`: PASS → PASS.
- Scoped ESLint: 0 errors; 8 unchanged baseline warnings.
- `git diff --check`: PASS.
- Marketing registry Jest: 7/7 PASS.
- Registry integrity: 42 key/id rows, 17 literal calls, no missing calls, duplicates, key/id mismatches, or blocked entries without `blockedBy`.
- `pnpm check:doctrine`: PASS; `pnpm check:reuse-index`: PASS; `pnpm check:tsconfig`: PASS with two unchanged inert `.next*` include notes.
- `pnpm check:migrations`: command completed but the ledger check was skipped because Supabase credentials are absent in this isolated worktree; no migration files changed.
- `pnpm sync-types`: intentionally not run because this patrol cannot touch generated files; the authoritative non-generating `pnpm type-check` passed before and after.
- Detector: **105 files / 165 lines → 101 files / 153 lines**.
- Direct coming-soon toast detector: 4 remaining; two routed for manual approval and two retained for contextual review.

Adversarial verdict history:

1. **REJECTED** — false `image-studio.generate` promise for a live feature and an awaited dialog that kept an agent row disabled. Both defects were removed.
2. **REJECTED** — six built-but-gated Image Studio entries were marked `planned`. All six now use `blocked` plus named blockers.
3. **INFRASTRUCTURE BLOCKED** — no concrete defect remained, but interaction proof could not finish because the managed preview lease belongs to another checkout. The foreign preview reported **29.3 GB RSS**, above the patrol cap; this worktree neither reused nor stopped it.

The corrected diff is preserved for retry. It is **not CERTIFIED and not released**.

## New baseline lists

- Runtime literal candidates after the batch: **101 files / 153 lines** (the 99-file retained list above plus the two manual proposals).
- Registry: **42 entries**.
- Route page leaves: **1,004**.
- Top-level feature directories: **121**.
- Next run scope: structural novelty against these lists + ledger; periodic full pass remains required by the registry cadence.

## Cadence health

First run; there is no preceding-month P9 report history to evaluate. No cadence change proposed.

## Candidates noticed

No distinct new Pattern Patrol class was evidenced. The unregistered placeholder primitives are part of P9 itself, not a separate candidate.
