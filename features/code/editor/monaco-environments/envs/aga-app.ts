import type { MonacoEnvironmentDescriptor } from "../types";

const AGA_APP_PREFIX = "aga-app:";

/**
 * AGA App environment — same React 19 + Lucide + ShadCN baseline as the
 * Prompt App env, since aga_apps render with the same component shape.
 * Kept as a separate env (instead of expanding `prompt-app.applies`) so
 * future divergence (e.g. AGA-specific ambient hooks) is a one-line edit.
 */
export const AGA_APP_ENVIRONMENT: MonacoEnvironmentDescriptor = {
  id: "aga-app",
  label: "Applet",
  description:
    "React 19 + Lucide + ShadCN UI ambients for `aga_apps.component_code`.",
  applies: (tab) => tab.id.startsWith(AGA_APP_PREFIX),
  jsxRuntime: "preserve",
  compilerOptions: {
    strict: false,
    noImplicitAny: false,
    strictNullChecks: false,
    allowJs: true,
    checkJs: false,
    esModuleInterop: true,
  },
  diagnosticsOptions: {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  },
  libs: async () => {
    const mod = await import("@/features/code-editor/config/type-definitions");
    return [
      {
        filePath: "file:///node_modules/@types/aga-app/react/index.d.ts",
        content: mod.reactTypes,
      },
      {
        filePath: "file:///node_modules/@types/aga-app/lucide-react/index.d.ts",
        content: mod.lucideReactTypes,
      },
      {
        filePath:
          "file:///node_modules/@types/aga-app/ui-components/index.d.ts",
        content: mod.uiComponentTypes,
      },
      {
        filePath:
          "file:///node_modules/@types/aga-app/custom-components/index.d.ts",
        content: mod.customComponentTypes,
      },
    ];
  },
};
