# P9 — Coming-soon compliance patrol

**Retry:** 2026-08-29
**Run ID:** `019ff9f6-6062-78f0-a8d2-e96ec520f635`
**Original candidate:** `5bf578b45e084d57beeeb6eb5198f58a90bd9c0d` (escaped certification and shipped in `v0.4.561`)
**Corrected candidate:** `e8ea694e74a39b7a1d7253737a62278d00196e3d`
**Corrected release:** `v0.4.1442` at `bed0f23a91e60267224daf164cef040c1e945975`
**Final state:** **CERTIFIED · DELIVERED**

## Scope and immutable baseline

- Recovered the exact original candidate in isolated checkout `/Users/armanisadeghi/.codex/worktrees/p9-coming-soon-retry`; no shared-checkout mutation occurred.
- Verified the original candidate is an ancestor of both `v0.4.561` and `origin/main`.
- Installed worktree-local dependencies offline with a frozen lockfile; no dependency or generated-file changes.
- Pre-edit gates: type-check PASS; scoped ESLint 0 errors/8 warnings; doctrine, reuse-index, and tsconfig PASS.
- Required full detector pass used the P9 registry recipe, not git churn. Corrected-candidate snapshot: **103 runtime literal files / 158 lines**, **9 direct toast lines**, **38 registry entries**.
- Live `origin/main` after serialized delivery contains later structural novelty: **120 runtime literal files / 185 lines** and **82 registry entries**. Those later additions are the next patrol baseline, not evidence against this frozen batch.

## Findings and repair

The bounded interaction fallback initially passed 3/3, but the first fresh adversarial certifier **REJECTED** the original candidate for concrete defects:

1. `chat.add-to-docs` was registered as planned even though canonical Save to Document already exists.
2. `image-studio.edit-suggestions`, `image-studio.prompt-edit`, and `image-studio.face-detection` announced from handler branches hidden by the same false capability flag, so those promises were unreachable.

The five-file repair removed those four false registry entries and restored their exact pre-batch handlers. It preserved the six clear, reachable promise registrations. It did not wire the already-built document action because that would change behavior and build-chunk ownership beyond P9's approved mechanical recipe.

## Routed report

### Auto-fixed now

Six clear cases, covering nine handler occurrences, remain registered and wired through the approved primitive:

1. `agents.save-as-template`
2. `rich-document.convert-to-broker`
3. `image-studio.smart-crop`
4. `image-studio.suggest-annotations`
5. `image-studio.pii-redaction`
6. `education.premium-checkout`

### Manual approval requested

1. `features/image-studio/modes/edit/EditAiToolbar.tsx:347` — after suggestions run, the success toast promises a future one-click apply action. This matters because it creates an untracked product promise. Safe fix: either register `image-studio.apply-suggestion` and use `announceComingSoon`, or build the apply action. Arman must choose the intended post-suggestion interaction.
2. `features/whatsapp-clone/chat-view/MessageInputAttachMenu.tsx:62` — Camera attachment emits a bare coming-soon toast. This matters because the user-triggerable promise is absent from the registry. Safe fix: register `whatsapp.camera-attachment` and call `announceComingSoon`, or deliberately retire the demo action. Arman must decide whether the clone surface is supported.

No exception was proposed, approved, suppressed, or allowlisted.

### Backlog retained

The remaining **101 exact corrected-candidate detector files** lack rendered-context evidence, a stable reproduction, or a product decision. They remain Tier R/report-only:

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
- `features/cx-chat/actions/messageActionRegistry.ts`
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
- `features/image-studio/modes/annotate/AnnotateModeShell.tsx`
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

Important retained classes:

- Add-to-docs stubs remain bare in authenticated/public chat. Canonical `pushMarkdownToDocument` exists, but wiring it is a behavior and chunk-contract change for a focused non-patrol task.
- Image edit suggestions, prompt edit, and face detection handlers remain report-only until their capability-hidden controls become reachable.

## Certification

- Exact-candidate managed preview was owned by the isolated checkout and stopped when compilation reached **14.9 GB RSS**, exceeding the 8 GB patrol cap.
- The in-app Browser control provider was unavailable; after the bounded infrastructure retry, the constitutional focused fallback rendered the actual `PublicMessageOptionsMenu`, actual `AnnotateModeShell`, and canonical coming-soon dialog.
- Corrected focused interaction harness: **4/4 PASS**.
- Corrected source gates: type-check PASS; scoped ESLint 0 errors/7 baseline warnings; doctrine, reuse-index, tsconfig, registry integrity, marketing registry tests 7/7, literal-ID coverage, and diff check PASS.
- Fresh adversarial certifier verdict: **CERTIFIED** for the corrected candidate; no batch-caused defect.
- Current-main source comparison surfaced later unrelated baseline debt (two promoted icon lint errors and 17 reuse-index paths). These were unchanged outside the frozen P9 batch and did not reject certification.
- Release quality gates completed in advisory mode after the push and reported unrelated repository/database debt; P9 type-check, doctrine, manifest contracts, and corrected interaction proof remained green.
- A final fleet-wide `check:patrol-contracts` rerun on the newer concurrent main reports only the separate `pattern-patrol-fleet-health` prompt, project, and cwd drift. The generated manifest and live P9 automation still agree on ACTIVE status, worktree execution, and Thursday 00:10 cadence; this unrelated fleet baseline does not reject P9.

## Delivery reconciliation

- `v0.4.561` permanently records the original escaped candidate; that fact was not erased or rewritten.
- The corrected certified repair shipped once as `v0.4.1442`; no redundant release was created.
- Permanent run record now contains **12 events** ending `delivered`; authority ref: `refs/heads/patrol-runs/P9/019ff9f6-6062-78f0-a8d2-e96ec520f635`.

## Cadence health and candidates

The preceding month is not all clean: this is the repaired completion of the first P9 run. No longer cadence is proposed. Infrastructure blocks do not count as rejections; the one concrete rejection was repaired, so mutation is not paused. No recurring unregistered class met the evidence threshold for a Candidate-bench nomination.
