# Index Files Audit

> Generated: 2026-07-26  
> Purpose: inventory every `index.ts` / `index.tsx` file and map consumers before barrel elimination.

## Summary

| Metric | Count |
|--------|------:|
| Total `index.*` files | 45 |
| Barrel / mixed re-export files | 22 |
| Component-entry (`index.tsx` implementations) | 14 |
| Other | 9 |
| Unique files importing through an index | 224 |

## ESLint / build context

- Rule: `no-barrel-files/no-barrel-files` (warn) in `eslint.config.mjs`
- `next.config.js`: the no-barrel-files plugin parses every imported module and adds **5–10+ min** to builds
- Project doctrine: **no new barrel `index.ts` files**; import directly from source

## Classification key

| Kind | Meaning | Action |
|------|---------|--------|
| `barrel` | Re-exports only | **Delete** + repoint imports to source files |
| `mixed` | Re-exports + local code | Split local code out, delete re-exports |
| `component-entry` | Real component in `index.tsx` | **Rename** to named `.tsx` (not a barrel) |
| `other` | Manual review needed | Inspect before changing |

---

## Annihilation priority (barrels by importer count)

| Priority | File | Kind | Importers | Lines | Re-exports |
|----------|------|------|----------:|------:|-----------:|
| 1 | `features/messaging/index.ts` | barrel | 30 | 88 | 10 |
| 2 | `features/tasks/types/index.ts` | barrel | 26 | 40 | 2 |
| 3 | `features/sharing/components/index.ts` | barrel | 25 | 18 | 7 |
| 4 | `features/settings/index.ts` | barrel | 15 | 35 | 5 |
| 5 | `lib/redux/app-builder/service/index.ts` | barrel | 13 | 6 | 4 |
| 6 | `features/sharing/index.ts` | barrel | 10 | 17 | 6 |
| 7 | `features/scopes/components/active-context/quick-pick/index.ts` | barrel | 8 | 12 | 1 |
| 8 | `features/agents/redux/conversation-history/index.ts` | barrel | 6 | 20 | 4 |
| 9 | `utils/logger/index.ts` | barrel | 6 | 12 | 8 |
| 10 | `features/agents/components/run-controls/AdvancedRunSettings/algorithm/index.ts` | barrel | 4 | 19 | 2 |
| 11 | `features/applet/runner/header/index.ts` | barrel | 4 | 9 | 7 |
| 12 | `features/files/components/core/PdfAnnotationLayer/index.ts` | barrel | 4 | 3 | 1 |
| 13 | `features/code/agent-context/index.ts` | barrel | 3 | 39 | 10 |
| 14 | `features/scopes/components/active-context/context-tree/index.ts` | barrel | 3 | 43 | 2 |
| 15 | `lib/refs/index.ts` | barrel | 3 | 6 | 4 |
| 16 | `components/official/card-and-grid/index.ts` | barrel | 2 | 5 | 5 |
| 17 | `features/code/editor/monaco-environments/index.ts` | barrel | 2 | 47 | 1 |
| 18 | `lib/scheduler-client/index.ts` | barrel | 2 | 90 | 2 |
| 19 | `packages/matrx-agents/src/adapters/index.ts` | barrel | 2 | 20 | 4 |
| 20 | `features/agents/components/run-controls/AdvancedRunSettings/index.ts` | barrel | 1 | 39 | 3 |
| 21 | `features/pdf/components/viewer/annotation-layer/index.ts` | barrel | 1 | 11 | 3 |
| 22 | `features/tool-call-visualization/renderers/get-user-lists/index.ts` | barrel | 1 | 3 | 2 |

---

## Full inventory (all index files)

### `features/messaging/index.ts`

- **Kind:** barrel
- **Lines:** 88
- **Re-export statements:** 10
- **Importer count:** 30

<details>
<summary>Importers (30)</summary>

- `app/(core)/messages/MessagesLayoutClient.tsx`
- `app/(core)/messages/MessagesPageClient.tsx`
- `app/(core)/messages/[conversationId]/page.tsx`
- `app/(dev)/demos/dynamic-imports/DynamicMessaging.tsx`
- `app/(dev)/demos/whatsapp-demo/WhatsAppDemoClient.tsx`
- `app/(dev)/demos/whatsapp-window-demo/WhatsAppWindowDemoClient.tsx`
- `components/layout/new-layout/DesktopLayout.tsx`
- `components/membership/InvitationsPanel.tsx`
- `components/membership/MembersPanel.tsx`
- `features/agents/components/usages/NotifyOwnerDialog.tsx`
- `features/agents/components/usages/driftMessageTemplate.ts`
- `features/marketing/components/access/SiteAccessWorkspace.tsx`
- `features/messaging/actions/messageActionRegistry.tsx`
- `features/messaging/components/MessageActionChips.tsx`
- `features/messaging/service/sendDirectActionMessage.ts`
- `features/organizations/components/InvitationManager.tsx`
- `features/settings/tabs/MessagingTab.tsx`
- `features/sharing/components/tabs/ShareWithUserTab.tsx`
- `features/shell/components/header/header-right-menu/MessagesMenuItem.tsx`
- `features/shell/islands/LazyMessagingIsland.tsx`
- `features/tasks/components/TaskAssigneePicker.tsx`
- `features/whatsapp-clone/hooks/useWhatsAppChat.ts`
- `features/whatsapp-clone/hooks/useWhatsAppConversations.ts`
- `features/whatsapp-clone/shell/WhatsAppShellInner.tsx`
- `features/window-panels/windows/messaging/MessagesWindow.tsx`
- `features/window-panels/windows/messaging/SingleMessageWindow.tsx`
- `hooks/useSupabaseMessaging.ts`
- `lib/redux/rootReducer.ts`
- `lib/supabase/messaging.ts`
- `utils/permissions/service.ts`

</details>

### `features/tasks/types/index.ts`

- **Kind:** barrel
- **Lines:** 40
- **Re-export statements:** 2
- **Importer count:** 26

<details>
<summary>Importers (26)</summary>

- `features/dynamic-react/sdk/matrxSdk.ts`
- `features/projects/components/ProjectTaskList.tsx`
- `features/resource-manager/resource-picker/TasksResourcePicker.tsx`
- `features/tasks/components/AllTasksView.tsx`
- `features/tasks/components/CompactTaskItem.tsx`
- `features/tasks/components/QuickTasksSheet.tsx`
- `features/tasks/components/Sidebar.tsx`
- `features/tasks/components/TaskDetailPage.tsx`
- `features/tasks/components/TaskDetails.tsx`
- `features/tasks/components/TaskDetailsPanel.tsx`
- `features/tasks/components/TaskItem.tsx`
- `features/tasks/components/TaskList.tsx`
- `features/tasks/components/TaskListPane.tsx`
- `features/tasks/components/TasksContextSidebar.tsx`
- `features/tasks/components/TasksTableView.tsx`
- `features/tasks/components/mobile/MobileFilterMenu.tsx`
- `features/tasks/components/mobile/MobileTaskDetails.tsx`
- `features/tasks/hooks/useQuickTask.ts`
- `features/tasks/hooks/useTaskManager.ts`
- `features/tasks/redux/selectors.ts`
- `features/tasks/redux/taskUiSlice.ts`
- `features/tasks/services/aiExportService.ts`
- `features/tasks/services/projectService.ts`
- `features/tasks/services/taskService.ts`
- `features/tasks/utils/taskSorting.ts`
- `features/tasks/widgets/AssociateTaskButton.tsx`

</details>

### `features/sharing/components/index.ts`

- **Kind:** barrel
- **Lines:** 18
- **Re-export statements:** 7
- **Importer count:** 25

<details>
<summary>Importers (25)</summary>

- `app/(core)/documents/[id]/page.tsx`
- `app/(core)/workbooks/[id]/page.tsx`
- `app/(public)/p/e/[resourceType]/[id]/PublicResourceView.tsx`
- `app/(public)/s/[token]/SharedResourceView.tsx`
- `features/agents/browse/components/AgentBrowsePage.tsx`
- `features/agents/components/agent-listings/AgentCard.tsx`
- `features/agents/components/agent-listings/AgentListItem.tsx`
- `features/agents/components/sharing/AgentSharePanel.tsx`
- `features/education/library/components/DeckCard.tsx`
- `features/education/media/audio/components/AudioStudyDetail.tsx`
- `features/education/media/mindmap/components/MindMapDetail.tsx`
- `features/education/memory/components/MemoryDetail.tsx`
- `features/education/notes/EduNoteActionBar.tsx`
- `features/education/tutor/components/EducationTutorClient.tsx`
- `features/files/components/surfaces/FileInfoTab.tsx`
- `features/flashcards/components/set-detail/SetDetailView.tsx`
- `features/notes/components/NoteContentEditor.tsx`
- `features/notes/components/NoteTabItem.tsx`
- `features/notes/components/NotesLayout.tsx`
- `features/notes/components/mobile/NoteEditorDock.tsx`
- `features/overlays/OverlayController.tsx`
- `features/sharing/index.ts`
- `features/tasks/components/TaskDetailPage.tsx`
- `features/tasks/components/TaskDetailsPanel.tsx`
- `features/window-panels/windows/ShareModalWindow.tsx`

</details>

### `components/ui/JsonComponents/index.ts`

- **Kind:** component-entry
- **Lines:** 41
- **Re-export statements:** 0
- **Importer count:** 17

<details>
<summary>Importers (17)</summary>

- `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorConversion.tsx`
- `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorTester.tsx`
- `components/matrx/AnimatedForm/FlexAnimatedForm.tsx`
- `components/matrx/AnimatedForm/separated/FlexField.tsx`
- `components/ui/JsonComponents/JsonEditor.tsx`
- `components/ui/JsonComponents/UniversalJsonGroup.tsx`
- `components/ui/react-live-scope.ts`
- `features/administration/local-storage/LocalStorageAdmin.tsx`
- `features/ai-models/components/ConstraintsEditor.tsx`
- `features/ai-models/components/JsonFieldEditor.tsx`
- `features/ai-models/components/ModelRulesEditor.tsx`
- `features/ai-models/components/controls/ControlRuleRow.tsx`
- `features/ai-models/components/controls/ModelControlsEditor.tsx`
- `features/ai-models/components/endpoints/EndpointsApisContainer.tsx`
- `features/ai-models/components/offerings/OfferingForm.tsx`
- `features/ai-models/components/settings/SettingForm.tsx`
- `features/audio/voice/VoicesList.tsx`

</details>

### `features/settings/index.ts`

- **Kind:** barrel
- **Lines:** 35
- **Re-export statements:** 5
- **Importer count:** 15

<details>
<summary>Importers (15)</summary>

- `app/(core)/user-settings/[[...path]]/page.tsx`
- `app/(core)/user-settings/layout.tsx`
- `app/(dev)/demos/settings-hooks/page.dev.tsx`
- `app/(dev)/demos/settings-shell/page.dev.tsx`
- `components/official/settings/primitives/SettingsLink.tsx`
- `components/user-preferences/StandalonePromptsPreferences.tsx`
- `features/agent-connections/components/sections/PreferencesSection.tsx`
- `features/content-templates/components/UserContentTemplateManager.tsx`
- `features/education/tutor/components/TutorSettingsPanel.tsx`
- `features/organizations/components/OrganizationCard.tsx`
- `features/overlays/OverlayController.tsx`
- `features/settings/route-shell/SettingsRouteSidebar.tsx`
- `features/settings/route-shell/SettingsTabContent.tsx`
- `features/window-panels/windows/iframe/BrowserWorkbenchWindow.tsx`
- `hooks/user-preferences/usePreferenceValue.ts`

</details>

### `lib/redux/app-builder/service/index.ts`

- **Kind:** barrel
- **Lines:** 6
- **Re-export statements:** 4
- **Importer count:** 13

<details>
<summary>Importers (13)</summary>

- `app/(transitional)/apps/builder/modules/field-demo/FieldBuilderDemo.tsx`
- `app/(transitional)/apps/builder/unified-concept/field-builder/FieldComponentsList.tsx`
- `features/applet/builder/modules/ComponentLibrary.tsx`
- `features/applet/builder/modules/app-builder/AppBuilder.tsx`
- `features/applet/builder/modules/applet-builder/AppletBuilder.tsx`
- `features/applet/builder/modules/container-builder/GroupBuilder.tsx`
- `features/applet/builder/modules/field-builder/FieldComponentsList.tsx`
- `features/applet/builder/modules/field-builder/PrimaryFieldBuilder.tsx`
- `features/applet/builder/modules/smart-parts/applets/MultiAppletSelector.tsx`
- `features/applet/builder/modules/smart-parts/containers/MultiGroupSelector.tsx`
- `features/applet/builder/modules/smart-parts/fields/EnhancedMultiFieldSelector.tsx`
- `features/applet/builder/modules/smart-parts/fields/MultiFieldSelector.tsx`
- `features/recipes/recipe-source/RecipeSelectionList.tsx`

</details>

### `utils/route-discovery/index.ts`

- **Kind:** other
- **Lines:** 55
- **Re-export statements:** 0
- **Importer count:** 13

<details>
<summary>Importers (13)</summary>

- `app/(admin)/administration/AdminDashboardClient.tsx`
- `app/(admin)/administration/layout.tsx`
- `app/(admin)/administration/page.tsx`
- `app/(admin)/administration/utilities/all-routes/page.tsx`
- `app/(dev)/demos/layout.tsx`
- `components/ssr/RouteHeaderData.tsx`
- `components/ssr/RouteIndexPage.tsx`
- `components/ssr/route-display/ExpandableSectionsDisplay.tsx`
- `components/ssr/route-display/GroupedCardsDisplay.tsx`
- `components/ssr/route-display/RouteDisplaySwitcher.tsx`
- `features/admin/components/AdminRoutesDirectory.tsx`
- `features/admin/components/FeatureAdminPage.tsx`
- `features/admin/utils/admin-route-catalog-server.ts`

</details>

### `features/files/upload/index.ts`

- **Kind:** other
- **Lines:** 24
- **Re-export statements:** 0
- **Importer count:** 11

<details>
<summary>Importers (11)</summary>

- `app/Providers.tsx`
- `features/files/components/surfaces/MobileStack.tsx`
- `features/files/handler/hooks/useFileUpload.ts`
- `features/files/handler/upload.ts`
- `features/files/upload/__tests__/transport-policy.test.ts`
- `features/files/upload/cloudUpload.ts`
- `features/files/upload/tusUpload.ts`
- `features/media-capture/components/CameraAdminDiagnostics.tsx`
- `features/media-capture/components/CaptureTransportStrip.tsx`
- `features/war-room/components/thread/ThreadNewFileDialog.tsx`
- `features/war-room/components/thread/ThreadResourcesTab.tsx`

</details>

### `features/sharing/index.ts`

- **Kind:** barrel
- **Lines:** 17
- **Re-export statements:** 6
- **Importer count:** 10

<details>
<summary>Importers (10)</summary>

- `components/user-generated-table-data/TableListItem.tsx`
- `features/agent-apps/components/agent-app-listings/AgentAppCard.tsx`
- `features/content-templates/components/TemplateCard.tsx`
- `features/cx-chat/components/ChatHeaderControls.tsx`
- `features/cx-chat/components/SsrSidebarChats.tsx`
- `features/messaging/actions/messageActionRegistry.tsx`
- `features/scopes/components/associations/AttachedItemsSheet.tsx`
- `features/sharing/components/AccessSummaryPanel.tsx`
- `features/sharing/hooks/useAccessSummary.ts`
- `features/tasks/components/TaskItem.tsx`

</details>

### `features/scopes/components/active-context/quick-pick/index.ts`

- **Kind:** barrel
- **Lines:** 12
- **Re-export statements:** 1
- **Importer count:** 8

<details>
<summary>Importers (8)</summary>

- `app/(admin)/administration/ui/official-components/component-displays/drill-deck-context-picker.tsx`
- `app/(admin)/administration/ui/official-components/component-displays/miller-columns-context-picker.tsx`
- `app/(dev)/demos/scopes/context-lab/reimagine/QuickPick.tsx`
- `app/(dev)/demos/scopes/context-lab/reimagine/engine.ts`
- `app/(dev)/demos/scopes/context-lab/reimagine/parts.tsx`
- `features/resource-manager/resource-picker/ContextValuesResourcePicker.tsx`
- `features/resource-manager/resource-picker/__tests__/context-value-resource.test.ts`
- `features/resource-manager/resource-picker/context-value-resource.ts`

</details>

### `features/agents/redux/conversation-history/index.ts`

- **Kind:** barrel
- **Lines:** 20
- **Re-export statements:** 4
- **Importer count:** 6

<details>
<summary>Importers (6)</summary>

- `features/agents/components/conversation-actions/conversationActionRegistry.tsx`
- `features/agents/components/conversation-history/ConversationHistorySidebar.tsx`
- `features/agents/components/conversation-history/ConversationSourceFilterTree.tsx`
- `features/settings/tabs/ConversationFiltersTab.tsx`
- `features/window-panels/windows/agents/ChatHistoryWindow.tsx`
- `lib/redux/rootReducer.ts`

</details>

### `utils/logger/index.ts`

- **Kind:** barrel
- **Lines:** 12
- **Re-export statements:** 8
- **Importer count:** 6

<details>
<summary>Importers (6)</summary>

- `app/api/logs/route.ts`
- `components/debug/debug-interface.tsx`
- `components/debug/log-details-dialog.tsx`
- `lib/redux/store.ts`
- `utils/logger/components/LogDetailView.tsx`
- `utils/logger/components/ReduxLogViewer.tsx`

</details>

### `features/administration/schema-visualizer/index.tsx`

- **Kind:** component-entry
- **Lines:** 127
- **Re-export statements:** 0
- **Importer count:** 4

<details>
<summary>Importers (4)</summary>

- `app/(admin)/administration/database/schema-visualizer-enhanced/page.tsx`
- `app/(admin)/administration/database/schema-visualizer/page.tsx`
- `app/api/schema-overview/route.ts`
- `features/administration/schema-visualizer/SchemaVisualizerLayout.tsx`

</details>

### `features/agents/components/run-controls/AdvancedRunSettings/algorithm/index.ts`

- **Kind:** barrel
- **Lines:** 19
- **Re-export statements:** 2
- **Importer count:** 4

<details>
<summary>Importers (4)</summary>

- `app/(dev)/demos/run-settings/advanced-run-settings-demo/page.tsx`
- `features/agents/components/run-controls/AdvancedRunSettings/AdvancedRunSettings.tsx`
- `features/agents/components/run-controls/AdvancedRunSettings/ComplexityBadge.tsx`
- `features/agents/components/run-controls/AdvancedRunSettings/index.ts`

</details>

### `features/applet/runner/header/index.ts`

- **Kind:** barrel
- **Lines:** 9
- **Re-export statements:** 7
- **Importer count:** 4

<details>
<summary>Importers (4)</summary>

- `app/(transitional)/apps/all-layouts/page.tsx`
- `app/(transitional)/apps/demo/page.tsx`
- `features/applet/builder/previews/LiveAppAndAppletPreview.tsx`
- `features/applet/demo/AppDemoManager.tsx`

</details>

### `features/files/components/core/PdfAnnotationLayer/index.ts`

- **Kind:** barrel
- **Lines:** 3
- **Re-export statements:** 1
- **Importer count:** 4

<details>
<summary>Importers (4)</summary>

- `features/file-analysis/components/AnnotatablePdfCanvas.tsx`
- `features/file-analysis/studio/StudioShell.tsx`
- `features/file-analysis/studio/panels/AnnotationsPanel.tsx`
- `features/files/components/surfaces/single-file/PdfEditTab.tsx`

</details>

### `components/ui/star-rating/index.tsx`

- **Kind:** component-entry
- **Lines:** 74
- **Re-export statements:** 0
- **Importer count:** 3

<details>
<summary>Importers (3)</summary>

- `components/matrx/AnimatedForm/FlexAnimatedForm.tsx`
- `components/matrx/AnimatedForm/separated/FlexField.tsx`
- `components/ui/star-rating/colors.tsx`

</details>

### `features/agent-apps/sample-code/templates/index.ts`

- **Kind:** component-entry
- **Lines:** 101
- **Re-export statements:** 0
- **Importer count:** 3

<details>
<summary>Importers (3)</summary>

- `app/(core)/agent-apps/templates/[mode]/page.tsx`
- `app/(core)/agent-apps/templates/page.tsx`
- `features/agent-apps/components/CreateAgentAppForm.tsx`

</details>

### `features/code/agent-context/index.ts`

- **Kind:** barrel
- **Lines:** 39
- **Re-export statements:** 10
- **Importer count:** 3

<details>
<summary>Importers (3)</summary>

- `app/(dev)/demos/context-menu/_components/CodeEditorDemoPanel.tsx`
- `app/(dev)/demos/context-menu/_fixtures/lab-surface-presets.ts`
- `features/code-editor/components/CodeEditorContextMenu.tsx`

</details>

### `features/scopes/components/active-context/context-tree/index.ts`

- **Kind:** barrel
- **Lines:** 43
- **Re-export statements:** 2
- **Importer count:** 3

<details>
<summary>Importers (3)</summary>

- `app/(dev)/demos/scopes/context-lab/dense/ContextTree.tsx`
- `app/(dev)/demos/scopes/context-lab/dense/model.ts`
- `app/(dev)/demos/scopes/context-lab/dense/shared.tsx`

</details>

### `lib/refs/index.ts`

- **Kind:** barrel
- **Lines:** 6
- **Re-export statements:** 4
- **Importer count:** 3

<details>
<summary>Importers (3)</summary>

- `app/(dev)/demos/general/services/ref-manager/page.dev.tsx`
- `app/Providers.tsx`
- `lib/refs/components/ExampleComponent.tsx`

</details>

### `components/message-display/index.ts`

- **Kind:** other
- **Lines:** 8
- **Re-export statements:** 0
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `components/message-display/MessageContentDisplay.tsx`
- `components/voice/voice-assistant-ui/MessagesDisplay.tsx`

</details>

### `components/official/card-and-grid/index.ts`

- **Kind:** barrel
- **Lines:** 5
- **Re-export statements:** 5
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `app/(admin)/administration/ui/official-components/component-displays/card-and-grid.tsx`
- `components/NotFoundContent.tsx`

</details>

### `features/agent-apps/components/shells/index.ts`

- **Kind:** component-entry
- **Lines:** 73
- **Re-export statements:** 0
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `features/agent-apps/components/AgentAppPublicRendererImpl.tsx`
- `features/agent-apps/components/builder/ShellPicker.tsx`

</details>

### `features/code/editor/monaco-environments/index.ts`

- **Kind:** barrel
- **Lines:** 47
- **Re-export statements:** 1
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `features/code/editor/EditorArea.tsx`
- `features/code/layout/StatusBar.tsx`

</details>

### `features/rich-document/actions/sources/index.ts`

- **Kind:** component-entry
- **Lines:** 45
- **Re-export statements:** 0
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `features/context-menu-v3/hooks/useContextMenuActions.ts`
- `features/rich-document/runtime/useActionSurfaceProvider.ts`

</details>

### `lib/scheduler-client/index.ts`

- **Kind:** barrel
- **Lines:** 90
- **Re-export statements:** 2
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `app/(admin)/administration/automation/scheduling/cron-tester/page.tsx`
- `features/scheduling/components/form/triggers/CronForm.tsx`

</details>

### `packages/matrx-agents/src/adapters/index.ts`

- **Kind:** barrel
- **Lines:** 20
- **Re-export statements:** 4
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `packages/matrx-agents/src/config/registry.ts`
- `packages/matrx-agents/src/public.ts`

</details>

### `packages/matrx-agents/src/config/index.ts`

- **Kind:** other
- **Lines:** 13
- **Re-export statements:** 0
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `features/agents/package-bootstrap/configure-agents.ts`
- `packages/matrx-agents/src/public.ts`

</details>

### `utils/idle-scheduler/index.ts`

- **Kind:** other
- **Lines:** 36
- **Re-export statements:** 0
- **Importer count:** 2

<details>
<summary>Importers (2)</summary>

- `app/DeferredSingletons.tsx`
- `features/shell/islands/DeferredIslands.tsx`

</details>

### `components/matrx/ConfigBuilder/index.tsx`

- **Kind:** component-entry
- **Lines:** 407
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/ui/react-live-scope.ts`

</details>

### `components/matrx/delete-dialog/index.tsx`

- **Kind:** component-entry
- **Lines:** 64
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudComponent.tsx`

</details>

### `components/matrx/dragable-sidebar/index.tsx`

- **Kind:** component-entry
- **Lines:** 82
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudSidebar.tsx`

</details>

### `components/matrx/hover-tooltip/index.tsx`

- **Kind:** component-entry
- **Lines:** 27
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudSidebar.tsx`

</details>

### `components/matrx/pagination/index.tsx`

- **Kind:** component-entry
- **Lines:** 147
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudTable.tsx`

</details>

### `components/matrx/radio/index.tsx`

- **Kind:** component-entry
- **Lines:** 28
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudSidebar.tsx`

</details>

### `components/matrx/scroll-area/index.tsx`

- **Kind:** component-entry
- **Lines:** 16
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudSidebar.tsx`

</details>

### `components/matrx/three-dot-menu/index.tsx`

- **Kind:** component-entry
- **Lines:** 49
- **Re-export statements:** 0
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `components/crud/CrudTable.tsx`

</details>

### `features/agents/components/run-controls/AdvancedRunSettings/index.ts`

- **Kind:** barrel
- **Lines:** 39
- **Re-export statements:** 3
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `app/(dev)/demos/run-settings/advanced-run-settings-demo/page.tsx`

</details>

### `features/pdf/components/viewer/annotation-layer/index.ts`

- **Kind:** barrel
- **Lines:** 11
- **Re-export statements:** 3
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `features/files/components/core/PdfAnnotationLayer/index.ts`

</details>

### `features/tool-call-visualization/renderers/get-user-lists/index.ts`

- **Kind:** barrel
- **Lines:** 3
- **Re-export statements:** 2
- **Importer count:** 1

<details>
<summary>Importers (1)</summary>

- `features/tool-call-visualization/registry/registry.tsx`

</details>

### `features/education/convert/generators/index.ts`

- **Kind:** other
- **Lines:** 47
- **Re-export statements:** 0
- **Importer count:** 0

_No static importers found._

### `features/rich-document/actions/handlers/index.ts`

- **Kind:** other
- **Lines:** 23
- **Re-export statements:** 0
- **Importer count:** 0

_No static importers found._

### `features/transcript-studio/modules/index.ts`

- **Kind:** other
- **Lines:** 17
- **Re-export statements:** 0
- **Importer count:** 0

_No static importers found._

### `scripts/schema-check/checks/index.ts`

- **Kind:** other
- **Lines:** 16
- **Re-export statements:** 0
- **Importer count:** 0

_No static importers found._

---

## Component-entry `index.tsx` files (rename, don't delete)

- `components/ui/JsonComponents/index.ts` — 17 importers
- `features/administration/schema-visualizer/index.tsx` — 4 importers
- `components/ui/star-rating/index.tsx` — 3 importers
- `features/agent-apps/sample-code/templates/index.ts` — 3 importers
- `features/agent-apps/components/shells/index.ts` — 2 importers
- `features/rich-document/actions/sources/index.ts` — 2 importers
- `components/matrx/ConfigBuilder/index.tsx` — 1 importers
- `components/matrx/delete-dialog/index.tsx` — 1 importers
- `components/matrx/dragable-sidebar/index.tsx` — 1 importers
- `components/matrx/hover-tooltip/index.tsx` — 1 importers
- `components/matrx/pagination/index.tsx` — 1 importers
- `components/matrx/radio/index.tsx` — 1 importers
- `components/matrx/scroll-area/index.tsx` — 1 importers
- `components/matrx/three-dot-menu/index.tsx` — 1 importers
