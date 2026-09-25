// features/code-editor/intelligence-places.ts
//
// WHERE EACH CODE EDITOR JOB RUNS — drawn on /intelligence/code_editor.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const CODE_EDITOR_PLACES: FeaturePlaces = {
  feature: "code_editor",
  label: "Code editor",
  aliases: {
    "generic-code-editor": K.code_editor__code_edit,
    "prompt-app-ui-editor": K.code_editor__prompt_app_ui_edit,
    "code-editor-dynamic-context": K.code_editor__dynamic_context_edit,
  },
  roots: ["features/code-editor", "features/window-panels/windows/multi-file-smart-code-editor"],
  places: [
    {
      id: "ai-code-editor",
      label: "AI code editor",
      trigger: "Ask AI to change the code",
      mandateKeys: [K.code_editor__code_edit],
      sources: [
        "features/code-editor/components/AICodeEditor.tsx",
        "features/code-editor/components/AICodeEditorModalV2.tsx",
        "features/code-editor/components/ContextAwareCodeEditorCompact.tsx",
        "features/code-editor/components/ContextAwareCodeEditorModal.tsx",
        "features/code-editor/hooks/useAICodeEditor.ts",
      ],
    },
    {
      id: "modes",
      label: "AI code editor",
      trigger: "App-screen and context-aware editing modes",
      mandateKeys: [
        K.code_editor__code_edit,
        K.code_editor__prompt_app_ui_edit,
        K.code_editor__dynamic_context_edit,
      ],
      sources: ["features/code-editor/agent-code-editor/agents.ts"],
    },
    {
      id: "multi-file",
      label: "Multi-file code editor window",
      trigger: "Ask AI to change the files",
      mandateKeys: [K.code_editor__code_edit],
      sources: [
        "features/window-panels/windows/multi-file-smart-code-editor/MultiFileSmartCodeEditorWindow.tsx",
      ],
    },
  ],
};
