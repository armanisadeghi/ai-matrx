import type { EditorDiagnostic } from "@/features/code/redux/diagnosticsSlice";

/** Stable tab id — mirrors `/code` filesystem tab key shape. */
export const DEMO_CODE_EDITOR_TAB_ID = "demo:context-menu/panel.tsx";

export const DEMO_CODE_EDITOR_FILE_PATH = "demo/context-menu/panel.tsx";
export const DEMO_CODE_EDITOR_LANGUAGE = "typescript";

/** Placeholder diagnostics — same wire format as `diagnosticsSlice`. */
export const DEMO_CODE_EDITOR_DIAGNOSTICS: EditorDiagnostic[] = [
  {
    severity: "error",
    message: "Type 'string' is not assignable to type 'number'.",
    source: "ts",
    code: "TS2322",
    startLine: 3,
    endLine: 3,
    startColumn: 10,
    endColumn: 24,
  },
  {
    severity: "warning",
    message: "'name' is declared but its value is never read.",
    source: "ts",
    code: "TS6133",
    startLine: 2,
    endLine: 2,
    startColumn: 15,
    endColumn: 19,
  },
];

export const DEMO_CODE_EDITOR_ALL_DIAGNOSTICS: Record<
  string,
  EditorDiagnostic[]
> = {
  [DEMO_CODE_EDITOR_TAB_ID]: DEMO_CODE_EDITOR_DIAGNOSTICS,
};

export const DEMO_CODE_EDITOR_INITIAL_CONTENT = `// Mirrors /code workspace context (matrx-user/code-editor)
// Select text before right-click to populate vsc_selected_text.
function greet(name: string): number {
  return "Hello, " + name;
}
`;
