/**
 * compileCodeBlock — a chat/notes React code block (and a canvas React
 * artifact) → a component, through `@ai-matrx/code-runtime`.
 *
 * Scope: the package's core entries plus whatever the block imports or names
 * (heavy libraries load only when referenced — `detectEntries`). The curated
 * RLS-scoped `matrx` data SDK rides as a host override. With no default
 * export, App/Main/Page/Component/Demo/Example/Root win over the last
 * PascalCase binding (chat snippets often define helpers after the app).
 *
 * Runs in the app's own JS context: appropriate for first-party generated
 * code, never hostile third-party code.
 */
import type { ComponentType } from "react";
import { compileAsync, detectEntries } from "@ai-matrx/code-runtime";
import { provideAppScopeModules } from "@/lib/code-runtime/app-scope";
import { createMatrxSdk } from "./sdk/matrxSdk";

export async function compileCodeBlock({
  code,
  language = "tsx",
}: {
  code: string;
  /** "jsx" → no TypeScript; anything else → TSX. */
  language?: "jsx" | "tsx";
}): Promise<ComponentType<Record<string, unknown>>> {
  provideAppScopeModules();
  const file = language === "jsx" ? "block.jsx" : "block.tsx";
  const files = { [file]: code };
  const result = await compileAsync(
    files,
    file,
    { entries: detectEntries(files), overrides: { matrx: createMatrxSdk() }, shadowDangerousGlobals: false },
    { origin: "code-block", componentCandidate: "conventional" },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.Component;
}
