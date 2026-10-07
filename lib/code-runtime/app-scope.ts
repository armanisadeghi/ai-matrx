/**
 * The page's full scope: every stored-component module (`stored-scope.ts`)
 * plus the heavy optional libraries chat code blocks may reference. Each
 * library is a literal-specifier `import()` — its own chunk, fetched only
 * when a body references it. Never an async `import("lucide-react")`.
 */
import { provideScopeModules } from "@ai-matrx/code-runtime/scope";
import { provideStoredComponentScopeModules } from "./stored-scope";

let provided = false;

/** Idempotent: call before any compile in the page. */
export function provideAppScopeModules(): void {
  provideStoredComponentScopeModules();
  if (provided) return;
  provided = true;
  provideScopeModules({
    "motion/react": () => import("motion/react"),
    "react-katex": () => import("./react-katex-scope"),
    "react-pdf": () => import("react-pdf"),
    // A person's code imports `xlsx`: it gets the SheetJS module Alchemy's workbook engine bundles (one copy in the app).
    xlsx: async () => (await import("@ai-matrx/alchemy/operate/formats/xlsx")).loadSheetJs(),
    "@react-three/fiber": () => import("@react-three/fiber"),
    three: () => import("three"),
    "date-fns": () => import("date-fns"),
    lodash: () => import("lodash"),
  });
}
