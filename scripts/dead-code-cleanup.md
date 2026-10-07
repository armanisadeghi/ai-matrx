# Dead Code Cleanup — Phase 2 (Post-Barrel)

**Status as of 2026-04-25:**
- Barrel phase is ✅ complete — 69 barrels remain (66 healthy, 3 just cleaned up, 0 unused)
- This document covers the next two cleanup phases

---

## Overview of remaining work

| Category | Count | Risk | Approach |
|---|---|---|---|
| Unused non-barrel files | 1,484 | Medium–High | Subagents by directory bucket |
| Files with unused exports | 1,677 | Low–Medium | Subagents per module |
| Unused npm dependencies | 50 | Low | Manual review then `pnpm remove` |

---

## Phase 2A — Unused Dependencies (50 packages)

> **Do not bulk-remove. Review each one.** Some may be false positives (dynamic imports, CSS-only packages, peer deps).

### Candidates likely safe to remove (no dynamic usage pattern)
```
anthropic-vertex-ai          # Vertex AI wrapper — project uses AI Gateway
@cerebras/cerebras_cloud_sdk # Direct SDK — project uses AI Gateway model strings
@ricky0123/vad-web           # Voice activity detection, no VAD usage found
tui-color-picker             # Legacy color picker, replaced
react-nowplaying             # Audio now-playing UI — not in use

react-json-view              # JSON viewer — superseded by custom components
react-audio-player           # Audio player — superseded
react-webcam                 # Webcam — no webcam features active
react-player                 # Video player — not wired
open-graph-scraper           # OG scraper — only used in dead code

onnxruntime-web              # ONNX ML runtime — no active ML inference
wavesurfer.js                # Audio waveform — no waveform UI active
ag-grid-community            # AG Grid — replaced by custom DataTable
ag-grid-react                # AG Grid React — same as above
@reactflow/node-resizer      # Reactflow plugin — check if reactflow itself used
@remirror/extension-markdown # Remirror extension — check if remirror is used

@radix-ui/react-accessible-icon # Rarely used Radix primitive
@react-pdf/renderer          # PDF rendering — check for active PDF features
google-fonts                 # CSS font import, redundant with next/font
next-redux-wrapper           # Server-side Redux hydration wrapper — project uses client Redux
liquid-glass-react           # iOS Liquid Glass — Expo only, not web admin
next-themes                  # Theme provider — project uses CSS var theming, not next-themes

array-move                   # Array reorder utility — check for DnD usage
qss                          # Query string — replaced by native URLSearchParams
cors                         # CORS middleware — handled at Next.js level
nodemailer                   # Email — check if email features are active
replicate                    # Replicate AI — check if any Replicate models used
js-tiktoken                  # Token counting — check if used for context window mgmt
```

### Likely false positives (investigate before removing)
```
@ai-sdk/openai               # May be used via direct import in non-gateway paths
@tailwindcss/container-queries  # May be in CSS without TS import
@types/mdast                 # AST types for remark/rehype pipeline
@types/unist                 # Same
@types/uuid                  # uuid used via import — check if @types/uuid needed

@types/vscode-webview        # VS Code webview types — for code editor feature
react-use                    # Huge utility collection, may be used via dynamic import
react-use-websocket          # WebSocket hook — check socket features
react-fast-marquee           # Marquee — check UI components
react-rough-notation         # Annotation effects — check for usage

react-wrap-balancer          # Text balance — check landing pages
react-remove-scroll          # Used by Radix UI internally, may be peer dep
react-device-detect          # Device detection — check for explicit usage
react-copy-to-clipboard      # Copy functionality — may have been replaced
re-resizable                 # Resizable panels — check panel components
use-long-press               # Long press hook — check mobile interactions
usehooks-ts                  # Hook collection — check for explicit usage
json-edit-react              # JSON editor — check admin tools
tailwind-scrollbar-hide      # Tailwind plugin — may be in CSS config
pdfjs-dist                   # PDF.js — check if PDF viewer active
websocket                    # WebSocket client — check for usage
```

### How to clean up
```bash
# After confirming a package is unused:
pnpm remove <package-name>

# After removing @types/* packages:
# No code change needed, just remove from package.json
```

---

## Phase 2B — Unused Files (1,484 files)

**Instructions for each subagent:**
1. For each file in your batch: search for any import of it (by path or exported symbol name)
2. If zero consumers exist → delete the file
3. If it has consumers → check if those consumers are themselves in the unused list (cascading dead code)
4. Do NOT delete files in `app/` that are valid Next.js routes (page.tsx, layout.tsx, loading.tsx, error.tsx) — those are entry points even with no TS imports
5. After deletion, check that nothing breaks by scanning for remaining imports of deleted paths

### Batch A — `components/matrx` (270 files) 🔴 High priority

This is the legacy Matrx component library. Many of these have been superseded by `components/official/`. Verify each file has no consumers before deleting.

```
components/matrx/AnimatedButton.tsx
components/matrx/AnimatedForm/AnimatedFormModal.tsx
components/matrx/AnimatedForm/separated/FlexField.tsx
components/matrx/AnimatedForm/separated/FlexForm.tsx
components/matrx/AnimatedForm/separated/FlexManager.tsx
components/matrx/AnimatedForm/separated/components/MatrxBaseInput.tsx
components/matrx/AnimatedForm/separated/components/MatrxButton.tsx
components/matrx/AnimatedForm/separated/components/MatrxButtonGroup.tsx
components/matrx/AnimatedForm/separated/components/MatrxCheckbox.tsx
components/matrx/AnimatedForm/separated/components/MatrxInput.tsx
components/matrx/AnimatedForm/separated/components/MatrxInputGroup.tsx
components/matrx/AnimatedForm/separated/components/MatrxRadio.tsx
components/matrx/AnimatedForm/separated/components/MatrxRadioGroup.tsx
components/matrx/AnimatedForm/separated/components/MatrxSelect.tsx
components/matrx/AnimatedForm/separated/components/MatrxTextarea.tsx
components/matrx/AnimatedRevealCard/SmallAnimatedRevealCard.tsx
components/matrx/ArmaniForm/EntityBaseTest.tsx
components/matrx/ArmaniForm/EntityRelationshipWrapper.tsx
components/matrx/ArmaniForm/action-system-2/ActionWrapper.tsx
components/matrx/ArmaniForm/action-system-2/ActionWrapperOld.tsx
components/matrx/ArmaniForm/action-system-2/DynamicFieldWrapper.tsx
components/matrx/ArmaniForm/action-system-2/IconRegistry.tsx
components/matrx/ArmaniForm/action-system-2/action-config.ts
components/matrx/ArmaniForm/action-system-2/action-registry.ts
components/matrx/ArmaniForm/action-system-2/actionContext.ts
components/matrx/ArmaniForm/action-system-2/actionTypes.ts
components/matrx/ArmaniForm/action-system-2/constants.ts
components/matrx/ArmaniForm/action-system-2/file.ts
components/matrx/ArmaniForm/action-system/ActionFieldWrapper.tsx
components/matrx/ArmaniForm/action-system/DynamicActionForm.tsx
components/matrx/ArmaniForm/action-system/FieldAction.tsx
components/matrx/ArmaniForm/action-system/InlineFormCard.tsx
components/matrx/ArmaniForm/action-system/action-components/EntityQuickListAction.tsx
components/matrx/ArmaniForm/action-system/action-components/JsonEditor.tsx
components/matrx/ArmaniForm/action-system/action-components/RecordSelector.tsx
components/matrx/ArmaniForm/action-system/action-components/actionComponentRegistry.ts
components/matrx/ArmaniForm/action-system/action-components/new.tsx
components/matrx/ArmaniForm/action-system/action-components/useActionComponent.ts
components/matrx/ArmaniForm/action-system/action-config.ts
components/matrx/ArmaniForm/action-system/action-creator.ts
components/matrx/ArmaniForm/action-system/actionRegistry.ts
components/matrx/ArmaniForm/action-system/hooks/GatewayExample.tsx
components/matrx/ArmaniForm/action-system/hooks/useDynamicGateway.ts
components/matrx/ArmaniForm/action-system/hooks/useEntityAction.ts
components/matrx/ArmaniForm/action-system/hooks/useFieldActions.ts
components/matrx/ArmaniForm/action-system/hooks/useNewAction.ts
components/matrx/ArmaniForm/action-system/icons/iconRegistry.tsx
components/matrx/ArmaniForm/action-system/inlines/registry.ts
components/matrx/ArmaniForm/action-system/inlines/types.ts
components/matrx/ArmaniForm/action-system/new.tsx
components/matrx/ArmaniForm/action-system/presentation/CollapsePresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/ContextMenuPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/CustomPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/DrawerPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/DropdownPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/HoverCardPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/InlinePresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/ModalPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/PopoverPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/SheetPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/TooltipPresentation.tsx
components/matrx/ArmaniForm/action-system/presentation/common.tsx
components/matrx/ArmaniForm/action-system/presentation/new.tsx
components/matrx/ArmaniForm/action-system/presentation/presentationAndTrigger.ts
components/matrx/ArmaniForm/action-system/presentation/presentationRegistry.tsx
components/matrx/ArmaniForm/action-system/triggers/EntityDropdownMenu.tsx
components/matrx/ArmaniForm/action-system/triggers/triggerComponents.tsx
components/matrx/ArmaniForm/action-system/triggers/triggerRegistry.tsx
components/matrx/ArmaniForm/action-system/triggers/types.ts
components/matrx/ArmaniForm/action-system/types.ts
components/matrx/ArmaniForm/field-components/EntityTextareaFullWidth.tsx
components/matrx/ArmaniForm/field-components/component-registry.tsx
components/matrx/ArmaniForm/field-components/file-upload.tsx
components/matrx/ArmaniForm/field-components/help-text/HelpPanel.css
components/matrx/ArmaniForm/field-components/help-text/HelpPanel.tsx
components/matrx/ArmaniForm/field-components/help-text/base-components.tsx
components/matrx/ArmaniForm/field-components/help-text/help-content.tsx
components/matrx/ArmaniForm/field-components/help-text/modal-configs.ts
components/matrx/ArmaniForm/field-components/help-text/types.ts
components/matrx/ArmaniForm/field-components/help-text/useHelpContent.ts
components/matrx/ArmaniForm/field-components/helpers/MatrxHoverWrapper.tsx
components/matrx/ArmaniForm/field-components/helpers/component-utils.ts
components/matrx/ArmaniForm/field-components/image-display.tsx
components/matrx/ArmaniForm/field-components/select/select-base.tsx
components/matrx/ArmaniForm/field-components/slider.tsx
components/matrx/ArmaniForm/field-components/switch.tsx
components/matrx/ArmaniForm/field-components/time-picker.tsx
components/matrx/ArmaniForm/field-components/wired/EntityFetchByPkAccordion.tsx
components/matrx/ArmaniForm/modal/AnimatedFormModal.tsx
components/matrx/ArmaniForm/modal/AnimatedTabModal.tsx
components/matrx/ArmaniForm/modal/useAnimatedTabModal.ts
components/matrx/ArmaniForm/smart-form/EntitySmartForm.tsx
components/matrx/ClientTopMenu.tsx
components/matrx/CommandIconButton.tsx
components/matrx/Entity/DataTable/BaseTable.tsx
components/matrx/Entity/DataTable/DataTable.tsx
components/matrx/Entity/DataTable/variants/DefaultTable.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/BaseTable.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/DataTable.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/DataTableFull.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/DraggableRow.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/index.tsx
components/matrx/Entity/DataTable/versions/DataTableOne/tableActions.tsx
components/matrx/Entity/EntityAbsoluteOverlay.tsx
components/matrx/Entity/EntityCardWithSelector.tsx
components/matrx/Entity/EntityRelationshipWrapper.tsx
components/matrx/Entity/EnhancedEntityCard.tsx
components/matrx/Entity/EnhancedEntityCardOld.tsx
components/matrx/Entity/MinimalEntityCard.tsx
components/matrx/Entity/StandardEntityCard.tsx
components/matrx/Entity/forms/EntityFormBody.tsx
components/matrx/Entity/forms/EntityFormContainer.tsx
components/matrx/Entity/forms/EntityFormManager.tsx
components/matrx/Entity/forms/EntityFormModal.tsx
components/matrx/Entity/forms/EntityFormTable.tsx
components/matrx/Entity/modal/EntityModal.tsx
components/matrx/Entity/modal/EntityTabModal.tsx
components/matrx/Entity/modal/EntityTabModalOld.tsx
components/matrx/Entity/modal/EntityTabModalOldOld.tsx
components/matrx/Entity/prewired-components/layouts/FullPageEntityLayout.tsx
components/matrx/Entity/prewired-components/layouts/parts/AiContextSections.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityButtons.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityEditableCard.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityHeader.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityQuickViewCard.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityReferenceActions.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntityRelationshipsCard.tsx
components/matrx/Entity/prewired-components/layouts/parts/EntitySummaryCard.tsx
components/matrx/Entity/prewired-components/layouts/parts/SelectionManager.tsx
components/matrx/Entity/prewired-components/layouts/parts/SelectionManagerOld.tsx
components/matrx/Entity/prewired-components/layouts/parts/SingleRecordSummary.tsx
components/matrx/Entity/prewired-components/layouts/parts/TabbedView.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/AutomationButtonsSection.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/BulkOperationsSection.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/DataManagementSection.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/RecordSelectionSection.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/ToolbarSection.tsx
components/matrx/Entity/prewired-components/layouts/parts/options/WatchModeSection.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/SmartCrudWrapper.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/DrawerSmartActions.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/EntityActions.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/EntityActions2.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartActions.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartActionsModals.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartActionsSelector.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartActionsToolbar.tsx
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/useEntityActionsNew.ts
components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/useEntityActionsSmart.ts
components/matrx/Entity/prewired-components/quick-reference/FullPageQuickReference.tsx
components/matrx/Entity/prewired-components/quick-reference/QuickReferenceAll.tsx
components/matrx/Entity/prewired-components/quick-reference/QuickReferenceSection.tsx
components/matrx/Entity/prewired-components/quick-reference/QuickReferenceSectionOld.tsx
components/matrx/Entity/prewired-components/quick-reference/QuickReferenceSections.tsx
components/matrx/Entity/prewired-components/quick-reference/QuickReferenceSectionsOld.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartAccordionQuickReference.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartQuickRef.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartQuickReference.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartQuickReferenceCards.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartQuickReferenceOld.tsx
components/matrx/Entity/prewired-components/quick-reference/SmartQuickReferenceSection.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickRefNoSelectionCard.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceCard.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceCompact.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceElegant.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceList.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceMinimal.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceSimple.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceTooltip.tsx
components/matrx/Entity/prewired-components/quick-reference/card-variants/QuickReferenceUltraMinimal.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceAllLists.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListCompact.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListElegant.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListMinimal.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListSimple.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListTooltip.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceListUltraMinimal.tsx
components/matrx/Entity/prewired-components/quick-reference/list-variants/QuickReferenceTable.tsx
components/matrx/Entity/quick-reference/QuickReference.tsx
components/matrx/Entity/quick-reference/QuickReferenceList.tsx
components/matrx/Entity/quick-reference/QuickReferenceSection.tsx
components/matrx/Entity/quick-reference/SmartQuickReference.tsx
components/matrx/Entity/related/EntityRelationshipsCard.tsx
components/matrx/Entity/related/RelatedEntitiesManager.tsx
components/matrx/Entity/related/SmartEntityRelated.tsx
components/matrx/EnhancedImage.tsx
components/matrx/FlexAnimatedForm.tsx
components/matrx/JsonViewer.tsx
components/matrx/MatrxBadgeCounter.tsx
components/matrx/MatrxCopyButton.tsx
components/matrx/MatrxCredentialsEntry.tsx
components/matrx/MatrxDataTable.tsx
components/matrx/MatrxDynamicPanel.tsx
components/matrx/MatrxHighlightButton.tsx
components/matrx/MatrxIconButton.tsx
components/matrx/MatrxSwitchButton.tsx
components/matrx/MatrxTextButton.tsx
components/matrx/MatrxTextEntry.tsx
components/matrx/MatrxToast.tsx
components/matrx/MatrxToggleButton.tsx
components/matrx/MatrxUiButton.tsx
components/matrx/MatrxUploader.tsx
components/matrx/ResizablePanel.tsx
components/matrx/ShadcnCardWrapper.tsx
components/matrx/SimpleForm.tsx
components/matrx/SmartFields.tsx
components/matrx/SortableList.tsx
components/matrx/Table.tsx
components/matrx/TailwindBadge.tsx
components/matrx/ThemeToggleGroupItem.tsx
components/matrx/TooltipIcon.tsx
components/matrx/WidthControl.tsx
components/matrx/card/EntityCardOld.tsx
components/matrx/card/MatrxCard.tsx
components/matrx/card/SmartCard.tsx
components/matrx/chat-ai-icons/index.ts
components/matrx/chat/ChatDivider.tsx
components/matrx/chat/ChatMessages.tsx
components/matrx/chat/ChatMessagesOld.tsx
components/matrx/chat/ChatResponseTest.tsx
components/matrx/chat/ChatTypingIndicator.tsx
components/matrx/chat/MessageBubble.tsx
components/matrx/chat/MessageBubbleOld.tsx
components/matrx/chat/MessageDisplay.tsx
components/matrx/chat/MessageInput.tsx
components/matrx/chat/MessageInputOld.tsx
components/matrx/chat/MessageInputOldOld.tsx
components/matrx/chat/MessageList.tsx
components/matrx/chat/MessageRow.tsx
components/matrx/chat/MessageTypes.ts
components/matrx/chat/OldMessages.tsx
components/matrx/chat/SimpleChatUI.tsx
components/matrx/chat/TypingIndicator.tsx
components/matrx/chat/interfaces.ts
components/matrx/chat/message-actions/MessageActions.tsx
components/matrx/chat/message-actions/MessageActionsTypes.ts
components/matrx/chat/message-actions/PlusCircleButton.tsx
components/matrx/chat/message-actions/VoiceToSpeech.tsx
components/matrx/context/Context.tsx
components/matrx/context/ContextEntities.tsx
components/matrx/context/ContextEntitiesTwo.tsx
components/matrx/context/OtherTypes.tsx
components/matrx/context/SuperContext.tsx
components/matrx/dialogs/MatrxConfirmDialog.tsx
components/matrx/dialogs/MatrxDialogFooterContent.tsx
components/matrx/dialogs/MatrxInfoDialog.tsx
components/matrx/dialogs/MatrxTooltipDialog.tsx
components/matrx/dialogs/OtherDialogThings.tsx
components/matrx/dialogs/index.ts
components/matrx/hover-content/AdvancedHoverContent.tsx
components/matrx/hover-content/HoverContextUpdater.tsx
components/matrx/hover-content/HoverCopier.tsx
components/matrx/hover-content/HoverFeatureBuilder.tsx
components/matrx/hover-content/HoverJsonContent.tsx
components/matrx/hover-content/HoverRelationshipDisplay.tsx
components/matrx/hover-content/HoverSwitcher.tsx
components/matrx/hover-content/HoverTextDisplay.tsx
components/matrx/hover-content/SmartHoverContent.tsx
components/matrx/hover-content/SmartHoverWithFetcher.tsx
components/matrx/hover-content/SmartHoverWithFetcherWithButton.tsx
components/matrx/hover-content/index.ts
components/matrx/input/EditableInput.tsx
components/matrx/input/EntityTextArea.tsx
components/matrx/input/SmartInputOld.tsx
components/matrx/matrx-collapsible/MatrxCollapsibleCard.tsx
components/matrx/matrx-collapsible/MatrxCollapsibleCardOld.tsx
components/matrx/matrx-record-list/MatrxRecordList.tsx
components/matrx/navigation/BreadcrumbNav.tsx
components/matrx/navigation/NavMenu.tsx
components/matrx/navigation/NavMenuOld.tsx
components/matrx/navigation/SidebarNav.tsx
components/matrx/panels/BrainstormPanel.tsx
components/matrx/panels/EntitySummaryPanel.tsx
components/matrx/panels/ToolbarCustomPanel.tsx
components/matrx/panels/ToolbarPanel.tsx
components/matrx/panels/UserPreferencesPanel.tsx
components/matrx/quick-reference/EntityQuickRef.tsx
components/matrx/quick-reference/EntityQuickRefSection.tsx
components/matrx/quick-reference/EntityQuickReference.tsx
components/matrx/quick-reference/EntitySmartQuickRef.tsx
components/matrx/quick-reference/EntitySmartQuickRefForTest.tsx
components/matrx/quick-reference/EntitySmartQuickRefOld.tsx
components/matrx/quick-reference/QuickRef.tsx
components/matrx/quick-reference/QuickRefAccordion.tsx
components/matrx/quick-reference/SmartQuickRef.tsx
components/matrx/quick-reference/SmartQuickRefOld.tsx
components/matrx/quick-reference/SmartQuickRefOldOld.tsx
components/matrx/quick-reference/SmartQuickRefOldTwo.tsx
```

### Batch B — `lib/redux` (126 files) 🔴 High priority

These are Redux slices, thunks, and utilities. Many are legacy slices from before the agent system migration. Cross-check with `features/agents/redux/` before deleting.

```
lib/redux/actions/audioActions.ts
lib/redux/actions/conceptActions.ts
lib/redux/actions/entityActions.ts
lib/redux/actions/index.ts
lib/redux/actions/promptActions.ts
lib/redux/actions/userActions.ts
lib/redux/concept/conceptSlice.ts
lib/redux/concept/types.ts
lib/redux/entities/entitySelectors.ts
lib/redux/entities/entitySlice.ts
lib/redux/entities/entityTypes.ts
lib/redux/entities/entityUtils.ts
lib/redux/features/README.md
lib/redux/features/agent-chat/actions.ts
lib/redux/features/agent-chat/agentChatSlice.ts
lib/redux/features/agent-chat/selectors.ts
lib/redux/features/agent-chat/tests/TestChatWrapper.tsx
lib/redux/features/agent-chat/tests/chat-test-definitions.ts
lib/redux/features/agent-chat/tests/useTestChatState.ts
lib/redux/features/agent-chat/types.ts
lib/redux/features/agent-chat/utils.ts
lib/redux/features/agents/agentsSlice.ts
lib/redux/features/agents/selectors.ts
lib/redux/features/agents/types.ts
lib/redux/features/agents/useAgentSelector.ts
lib/redux/features/audio/audioReducer.ts
lib/redux/features/audio/audioSelectors.ts
lib/redux/features/audio/audioSlice.ts
lib/redux/features/audio/audioTypes.ts
lib/redux/features/audio/audioUtils.ts
lib/redux/features/audio/useAudioState.ts
lib/redux/features/broker/brokerSelectors.ts
lib/redux/features/broker/brokerSlice.ts
lib/redux/features/broker/brokerTypes.ts
lib/redux/features/broker/brokerUtils.ts
lib/redux/features/chat/chatReducer.ts
lib/redux/features/chat/chatSelectors.ts
lib/redux/features/chat/chatSlice.ts
lib/redux/features/chat/chatTypes.ts
lib/redux/features/chat/chatUtils.ts
lib/redux/features/chat/useChat.ts
lib/redux/features/concepts/conceptsSlice.ts
lib/redux/features/concepts/selectors.ts
lib/redux/features/concepts/types.ts
lib/redux/features/entities/README.md
lib/redux/features/entities/entityCustomSelectors.ts
lib/redux/features/entities/entitySelectors.ts
lib/redux/features/entities/entitySlice.ts
lib/redux/features/entities/entityThunks.ts
lib/redux/features/entities/entityTypes.ts
lib/redux/features/entities/entityUtils.ts
lib/redux/features/entities/entityValidation.ts
lib/redux/features/entities/selectors.ts
lib/redux/features/socket/socketSelectors.ts
lib/redux/features/socket/socketSlice.ts
lib/redux/features/socket/socketTypes.ts
lib/redux/features/socket/socketUtils.ts
lib/redux/features/socket/useSocket.ts
lib/redux/features/user/userSelectors.ts
lib/redux/features/user/userSlice.ts
lib/redux/features/user/userThunks.ts
lib/redux/features/user/userTypes.ts
lib/redux/features/user/userUtils.ts
lib/redux/prompt-execution/actions.ts
lib/redux/prompt-execution/selectors.ts
lib/redux/prompt-execution/thunks/executePrompt.ts
lib/redux/prompt-execution/thunks/helpers.ts
lib/redux/prompt-execution/thunks/index.ts
lib/redux/prompt-execution/types.ts
lib/redux/selectors/audioSelectors.ts
lib/redux/selectors/conceptSelectors.ts
lib/redux/selectors/entitySelectors.ts
lib/redux/selectors/index.ts
lib/redux/selectors/promptSelectors.ts
lib/redux/selectors/userSelectors.ts
lib/redux/slices/agentChatSlice.ts
lib/redux/slices/agent-settings/agentSettingsSlice.ts
lib/redux/slices/agent-settings/index.ts
lib/redux/slices/agent-settings/selectors.ts
lib/redux/slices/agent-settings/types.ts
lib/redux/slices/aiProviderSlice.ts
lib/redux/slices/audioSlice.ts
lib/redux/slices/bookmarkSlice.ts
lib/redux/slices/callPlanningSlice.ts
lib/redux/slices/chatSlice.ts
lib/redux/slices/contentSlice.ts
lib/redux/slices/conversationSlice.ts
lib/redux/slices/customSlice.ts
lib/redux/slices/customerSlice.ts
lib/redux/slices/dataSlice.ts
lib/redux/slices/docSlice.ts
lib/redux/slices/emailSlice.ts
lib/redux/slices/formSlice.ts
lib/redux/slices/layoutSlice.ts
lib/redux/slices/mediaSlice.ts
lib/redux/slices/navigationSlice.ts
lib/redux/slices/productSlice.ts
lib/redux/slices/promptSlice.ts
lib/redux/slices/socketSlice.ts
lib/redux/slices/taskSlice.ts
lib/redux/slices/uiSlice.ts
lib/redux/slices/userSlice.ts
lib/redux/slices/vendorSlice.ts
lib/redux/slices/videoSlice.ts
lib/redux/slices/voiceSlice.ts
lib/redux/slices/webRtcSlice.ts
lib/redux/slices/workspaceSlice.ts
lib/redux/thunks/audioThunks.ts
lib/redux/thunks/conceptThunks.ts
lib/redux/thunks/entityThunks.ts
lib/redux/thunks/index.ts
lib/redux/thunks/promptThunks.ts
lib/redux/thunks/userThunks.ts
lib/redux/types/index.ts
lib/redux/types/types.ts
lib/redux/utils/audioUtils.ts
lib/redux/utils/entityUtils.ts
lib/redux/utils/index.ts
lib/redux/utils/promptUtils.ts
lib/redux/utils/userUtils.ts
```

### Batch C — `components/playground` (58 files) 🟢 Safe to delete

These are development/test components with no production consumers.

```
components/playground/adaptive-audio/AdaptiveAudio.tsx
components/playground/adaptive-audio/AdaptiveAudioModal.tsx
components/playground/adaptive-audio/AdaptiveAudioPage.tsx
components/playground/adaptive-audio/AudioPlayer.tsx
components/playground/adaptive-audio/ControlButton.tsx
components/playground/adaptive-audio/TrackCard.tsx
components/playground/adaptive-audio/TrackList.tsx
components/playground/adaptive-audio/types.ts
components/playground/adaptive-audio/useAdaptiveAudio.ts
components/playground/adaptive-audio/useAudioSession.ts
components/playground/api-test/ApiTestLayout.tsx
components/playground/api-test/ChatbotComposer.tsx
components/playground/api-test/ChatbotComposerOld.tsx
components/playground/api-test/ChatbotMessages.tsx
components/playground/api-test/TextEditor.tsx
components/playground/chatbot/ChatbotComposer.tsx
components/playground/chatbot/ChatbotMessages.tsx
components/playground/chatbot/DynamicChat.tsx
components/playground/data/DataPageLayout.tsx
components/playground/data/DataTabs.tsx
components/playground/data/DatabaseTable.tsx
components/playground/data/EntityDatabaseTable.tsx
components/playground/data/FormInput.tsx
components/playground/data/FormInputOld.tsx
components/playground/data/FormManager.tsx
components/playground/data/FormManagerOld.tsx
components/playground/data/MatrxTable.tsx
components/playground/data/RelationTable.tsx
components/playground/data/SelectSearch.tsx
components/playground/data/SortableEntityTable.tsx
components/playground/data/TableTester.tsx
components/playground/data/TestPage.tsx
components/playground/data/TestPageOld.tsx
components/playground/data/TestSortableTable.tsx
components/playground/data/TestTable.tsx
components/playground/data/UsersForm.tsx
components/playground/form/ComponentFormWrapper.tsx
components/playground/form/FilterInput.tsx
components/playground/form/FormDefinition.tsx
components/playground/form/FormGrid.tsx
components/playground/form/FormManager.tsx
components/playground/form/FormManagerOld.tsx
components/playground/form/FormTypes.tsx
components/playground/form/FormWrapper.tsx
components/playground/form/RawDataRow.tsx
components/playground/form/SearchInput.tsx
components/playground/form/SortableTable.tsx
components/playground/templates/audio-chat-template.ts
components/playground/templates/basic-chat-template.ts
components/playground/templates/video-chat-template.ts
components/playground/ui/CardDisplay.tsx
components/playground/ui/ComponentList.tsx
components/playground/ui/ComponentSkeleton.tsx
components/playground/ui/MetricsDisplay.tsx
components/playground/ui/ThemeSelector.tsx
components/playground/ui/ToolbarSection.tsx
components/playground/ui/WorkspaceLayout.tsx
components/playground/ui/old/old.tsx
```

### Batch D — `app/(authenticated)` (132 files) ⚠️ CAUTION

These are route-adjacent files (not page.tsx/layout.tsx themselves). Verify they have no consumers before deleting — some may be server components used by pages.

```
app/(authenticated)/admin/ai-model-tests/components/EnhancedChatInterface.tsx
app/(authenticated)/admin/ai-model-tests/components/ModelPlayground.tsx
app/(authenticated)/admin/ai-model-tests/components/StreamingChatInterface.tsx
app/(authenticated)/admin/ai-model-tests/components/StreamingChatInterfaceOld.tsx
app/(authenticated)/admin/ai-model-tests/components/TestChatInterface.tsx
app/(authenticated)/admin/ai-model-tests/components/TestChatInterfaceOld.tsx
app/(authenticated)/admin/concept-tests/concept-chat/components/ConceptChatInterface.tsx
app/(authenticated)/admin/concept-tests/concept-chat/components/ConceptChatInterfaceOld.tsx
app/(authenticated)/admin/concept-tests/concept-chat/components/ConceptChatMessage.tsx
app/(authenticated)/admin/concept-tests/concept-chat/components/ConceptChatMessageOld.tsx
app/(authenticated)/admin/concept-tests/concept-chat/components/ConceptChatSidebar.tsx
app/(authenticated)/admin/concept-tests/concept-chat/hooks/useConceptChat.ts
app/(authenticated)/admin/concept-tests/concept-chat/hooks/useConceptChatOld.ts
app/(authenticated)/admin/concept-tests/concept-chat/hooks/useConceptMessages.ts
app/(authenticated)/admin/socket-tests/components/AIChatClient.tsx
app/(authenticated)/admin/socket-tests/components/MultiSocketChat.tsx
app/(authenticated)/admin/socket-tests/components/SocketChatClient.tsx
app/(authenticated)/admin/socket-tests/components/SocketTestLayout.tsx
app/(authenticated)/admin/socket-tests/components/TextBoxInputOld.tsx
app/(authenticated)/admin/socket-tests/components/old/AIChatClientOld.tsx
app/(authenticated)/admin/socket-tests/components/old/MultiSocketChatOld.tsx
app/(authenticated)/admin/socket-tests/components/old/SocketChatClientOld.tsx
app/(authenticated)/admin/socket-tests/components/old/SocketTestLayoutOld.tsx
app/(authenticated)/admin/socket-tests/components/old/TextBoxInputOldOld.tsx
app/(authenticated)/admin/socket-tests/hooks/useAutoScroll.ts
app/(authenticated)/admin/socket-tests/hooks/useSocketState.ts
... (108 more in this bucket — run knip for full list)
```

### Batch E — `features/prompts` + `features/cx-chat` (70 files) ⚠️ Migration-sensitive

These overlap with the active agents migration. Check `features/agents/migration/INVENTORY.md` before deleting any file.

### Batch F — `app/entities` (53 files) 🟡 Medium risk

Entity admin pages that may have been superseded. Each page.tsx is a valid route entry point even with no TS imports, so delete only non-page files.

### Batch G — Remaining buckets (~800 files)

```
components/socket-io        (28)
components/animated         (23)
components/ui               (23)
features/rich-text-editor   (23)
components/admin            (18)
features/notes              (18)
components/advanced-image-editor (17)
components/applet           (17)
components/layout           (16)
../aidream/apps/shared/chat/src/cx-conversation    (14)
... and more
```

---

## Rules for all subagents

1. **Verify before deleting** — search for any import of the file path or its exported names
2. **Never delete page.tsx / layout.tsx / loading.tsx / error.tsx** — Next.js treats these as entry points
3. **Check for dynamic imports** — `dynamic(() => import('...'))` won't be caught by static search
4. **Check the migration inventory** — `features/agents/migration/INVENTORY.md` for prompts/chat files
5. **Delete whole dead subtrees** — if a parent file is unused, its children are likely unused too
6. **Report what you delete** — log each deleted file path for the final audit

---

## How to run a fresh audit
```bash
npx knip --reporter json > /tmp/knip-latest.json
# Then parse with python3 scripts similar to the ones already used
```

*Generated 2026-04-25. Re-run knip before starting each batch to get accurate file lists.*
