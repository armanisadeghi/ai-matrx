"use client";
/**
 * matrx-frontend's app bindings for @ai-matrx/rich-content: the windows, canvas, menus, kind
 * views, services and chat state the engine's blocks offer here, plus this app's domain blocks
 * (registered on import) and mermaid. Imported for its side effect by providers/richContentHost.
 */
import dynamic from "next/dynamic";
import { createElement } from "react";
import { configureRichContent } from "@ai-matrx/rich-content/host";
import { registerJsonAnswerRenderer } from "@ai-matrx/rich-content/display/block-interaction";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectIsAdminDebugger, selectIsAuthenticated, selectIsSuperAdmin, selectUser } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectDismissedPromptFixes, selectMermaidPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { setModulePreferences, setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { sessionKnobPrincipals } from "@/lib/scoped-config/sessionKnob";
import { setUserKnobMapEntry } from "@/lib/scoped-config/service";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { getArtifactDef, resolveArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { ArtifactRender, hasArtifactRenderer } from "@/features/canvas/artifact-types/artifact-renderers";
import { CodeBlockWithContextAttach } from "@/features/canvas/materialization/CodeBlockWithContextAttach";
import { useOpenConvertToShapeWindow } from "@/features/overlays/openers/convertToShapeWindow";
import { useOpenSmartCodeEditorWindow } from "@/features/overlays/openers/smartCodeEditorWindow";
import { useOpenTableViewerWindow } from "@/features/overlays/openers/tableViewerWindow";
import { useSaveAndOpenInCodeEditor } from "@/features/code/actions/saveAndOpenInCodeEditor";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { KindDataGate } from "@/components/official/structured-value/KindDataGate";
import { KindValueFrontDoor } from "@/components/official/structured-value/KindValueFrontDoor";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { KindRecordChrome, kindHasRecordChrome } from "@/features/content-ir/records/KindRecordChrome";
import { KindFixItBar } from "@/features/content-ir/react/fixit/KindFixItBar";
import MarkdownStream from "@ai-matrx/chat/ui/markdown-stream/MarkdownStream";
import { CitationMarkerInline } from "@/components/mardown-display/chat-markdown/citations/CitationMarkerInline";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { useAdvancedMenu } from "@/hooks/use-advanced-menu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import LocatedTableViewer from "@/features/data-tables/components/LocatedTableViewer";
import { OpenDestinationDialog } from "@/features/page-extraction/data-review/OpenDestinationDialog";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { getSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@ai-matrx/design-system";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { useMicField } from "@/features/audio/hooks/useMicField";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { fileUrls } from "@/features/files/handler/utils/python-base";
import { kindCanonicalExample, searchKindDefinitions } from "./kind-picker-data";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";
import { contentSourceKey, sameContentSource, useRegistryMenuSource } from "@/features/context-menu-v3/menu-presence";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";
import { convertOriginForSource, useDocumentDialogsHost } from "@/features/rich-document/hosts/DocumentDialogsHost";
import { RecordAnnotations } from "@/features/rich-document/annotations/RecordAnnotations";
import { annotationRecordOf, recordKeyOf } from "@/features/rich-document/annotations/record-of-source";
import { announceProposedGoogleWrite, isProposedGoogleWrite } from "@/features/google-workspace/export/proposedWrite";
import { createMermaidEditorScope, mermaidEditorManifest } from "@/features/surfaces/manifests/mermaid-editor.manifest";
import { useDiagramAgents } from "@/components/mermaid/hooks/useDiagramAgents";
import { useMachineFramesVisible } from "@ai-matrx/chat/agents/components/shared/transcript-audience";
import {
  selectHideReasoning,
  selectHideToolResults,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  isRenderableStructuredAgentAnswer,
  parseStructuredAgentAnswer,
  StructuredAgentAnswerBlock,
} from "@/components/mardown-display/blocks/json/StructuredAgentAnswerBlock";
// This app's domain blocks register into the engine's registries on import.
import "./domain-block-components";
import "./domain-block-dispatch";
// This app's rich-document handlers, source adapters and menu rows.
import "./rich-document-registrations";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

const SmallCodeEditor = dynamic(() => import("@/features/code-editor/components/code-block/SmallCodeEditorImpl"), {
  ssr: false,
  loading: () => createElement("div", { className: "h-full w-full min-h-24 animate-pulse rounded-md bg-muted" }),
});

const never = () => false;

configureRichContent({
  showManualCopy,
  readSessionKnob: (knob) => getSessionKnob(knob as never),
  loadHtmlToMarkdown: () =>
    Promise.all([
      import("@ai-matrx/rich-editor/core/html-to-markdown"),
      import("@tiptap/core"),
      import("@ai-matrx/rich-editor/core/extensions"),
    ]).then(([{ htmlToMarkdown }, { getSchema }, { createRichEditorExtensions }]) => {
      const schema = getSchema(createRichEditorExtensions());
      return (html: string) => htmlToMarkdown(html, schema);
    }),
  loadMermaid: () => import("mermaid").then((m) => m.default),
  loadMermaidElk: () => import("@mermaid-js/layout-elk").then((m) => m.default),
  app: {
    // canvas
    useCanvas,
    useCanvasOpenGuard,
    useOpenArtifactInCanvas,
    reportCanvasOpenDrop,
    getArtifactDef,
    resolveArtifactDef,
    hasArtifactRenderer,
    ArtifactRender,
    CodeBlockWithContextAttach,
    // windows
    useOpenConvertToShapeWindow,
    useOpenSmartCodeEditorWindow,
    useOpenTableViewerWindow,
    useSaveAndOpenInCodeEditor,
    useOpenOverlay: () => {
      const dispatch = useAppDispatch();
      return (payload: Parameters<typeof openOverlay>[0]) => dispatch(openOverlay(payload));
    },
    // identity / prefs
    useThemeMode,
    useHostUser: () => useAppSelector(selectUser),
    useIsAdminDebugger: () => useAppSelector(selectIsAdminDebugger),
    useIsAuthenticated: () => useAppSelector(selectIsAuthenticated),
    useMermaidPreferences: () => useAppSelector(selectMermaidPreferences),
    useSetMermaidPreferences: () => {
      const dispatch = useAppDispatch();
      return (preferences: Parameters<typeof setModulePreferences>[0]["preferences"]) =>
        dispatch(setModulePreferences({ module: "mermaid", preferences }));
    },
    // Dismissed prompt-fix suggestions follow the person (rich-editor PromptFixReview): same key → ids.
    usePromptFixDismissals: () => useAppSelector(selectDismissedPromptFixes),
    useSetPromptFixDismissals: () => {
      const dispatch = useAppDispatch();
      const store = useAppStore();
      return (key: string, ids: readonly string[]) => {
        const next = { ...selectDismissedPromptFixes(store.getState()) };
        if (ids.length > 0) next[key] = [...ids];
        else delete next[key];
        dispatch(setPreference({ module: "prompts", preference: "dismissedPromptFixes", value: next }));
      };
    },
    useImageKnob: useEffectiveKnob,
    imageKnobPrincipals: sessionKnobPrincipals,
    setImageKnobMapEntry: setUserKnobMapEntry,
    // rich document
    useHostDispatch: useAppDispatch,
    useHostGetState: () => useAppStore().getState,
    useIsSuperAdmin: () => useAppSelector(selectIsSuperAdmin),
    useActiveOrganizationId: () => useAppSelector(selectOrganizationId),
    holdDeliberateIntent: <T,>(work: () => T | Promise<T>) => Promise.resolve().then(work),
    useAlchemyDisclosure,
    useRegistryMenuSource,
    sameContentSource,
    contentSourceKey,
    openContextMenuForElement,
    convertOriginForSource,
    useDocumentDialogsHost,
    RecordAnnotations,
    annotationRecordOf,
    recordKeyOf,
    // the editor (@ai-matrx/rich-editor)
    ConfirmDialog,
    TextInputDialog,
    EditableContextMenu,
    buildApplicationScopeFromMenuContext,
    useMicField,
    useFileUpload,
    fileUrls,
    searchKindDefinitions,
    kindCanonicalExample,
    // kind views
    StructuredValueView,
    KindDataGate,
    KindValueFrontDoor,
    KindInstanceRender,
    KindRecordChrome,
    kindHasRecordChrome,
    KindFixItBar,
    // components
    MarkdownStream,
    CitationMarkerInline,
    CopyButtons,
    AdvancedMenu,
    useAdvancedMenu,
    EntityRef,
    JsonTreeViewer,
    RawJsonExplorer,
    NonEditableContextMenu,
    IconInputWithValidation,
    LocatedTableViewer,
    OpenDestinationDialog,
    SmallCodeEditor,
    // services
    HTMLPageService,
    ensureOrganizationContext: (options?: { organizationId?: string | null }) => ensureOrgId(options?.organizationId ?? null),
    isOrganizationSelectionCancelled: () => false,
    loadExportTargets: () => import("@/features/data-tables/export-targets"),
    loadSendToGoogle: () => import("@/features/google-workspace/export/sendToGoogle"),
    announceProposedGoogleWrite,
    isProposedGoogleWrite,
    mermaidEditorManifest,
    createMermaidEditorScope,
    useDiagramAgents,
    // chat block interaction
    useHideReasoning: (conversationId: string | null) =>
      useAppSelector(conversationId ? selectHideReasoning(conversationId) : never),
    useHideToolResults: (conversationId: string | null) =>
      useAppSelector(conversationId ? selectHideToolResults(conversationId) : never),
    useMachineFramesVisible,
  } as never,
});

// An agent's structured JSON answer draws as the bound output schema's view.
registerJsonAnswerRenderer(({ block, outputSchema, renderBasicMarkdown, index }) => {
  const structured = parseStructuredAgentAnswer(block.content, outputSchema as never);
  if (!structured || !isRenderableStructuredAgentAnswer(structured)) return null;
  return createElement(StructuredAgentAnswerBlock, {
    key: index,
    value: structured,
    rawContent: block.content,
    renderMarkdown: renderBasicMarkdown,
  } as never);
});
