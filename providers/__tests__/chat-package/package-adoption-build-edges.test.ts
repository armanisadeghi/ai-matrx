/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function clientDirectiveIsFirst(source: string): boolean {
  const parsed = ts.createSourceFile("entry.tsx", source, ts.ScriptTarget.Latest, true);
  const first = parsed.statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)
    && first.expression.text === "use client";
}

function importsName(source: string, name: string): boolean {
  const parsed = ts.createSourceFile("entry.tsx", source, ts.ScriptTarget.Latest, true);
  return parsed.statements.some((statement) => ts.isImportDeclaration(statement)
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some((binding) => binding.name.text === name));
}

test.each([
  ["advanced-menu", "copyText"],
  ["pro-textarea", "copyToClipboard"],
])("%s imports its clipboard helper in executable code, not just its example string", (file, name) => {
  expect(importsName(read(`app/(admin)/administration/ui/official-components/component-displays/${file}.tsx`), name)).toBe(true);
  expect(importsName(`const example = 'import { ${name} } from "clipboard"';`, name)).toBe(false);
});

test.each(["components/mermaid/export.ts", "features/scraper/utils/scraper-utils.js"])(
  "%s keeps its client boundary before imports",
  (file) => {
    const source = read(file);
    expect(clientDirectiveIsFirst(source)).toBe(true);
    // The guard must reject the actual migration failure: an import prepended to a directive.
    expect(clientDirectiveIsFirst('import { copyText } from "@ai-matrx/kit/clipboard";\n' + source)).toBe(false);
  },
);

test("Notes uses the one rich-copy door (agent-copy/copy-commands)", () => {
  const note = read("features/notes/components/NoteTabItem.tsx");
  expect(note).toContain('from "@ai-matrx/rich-content/copy/copy-commands"');
  expect(read("components/agent-copy/copy-commands.ts")).toContain("export async function copyRichContent(");
});

test("the context preview copies through the CopyButtons host slot; no InlineCopyButton slot exists", () => {
  expect(read("../aidream/apps/shared/chat/src/agents/components/context-preview/AttachedContextSection.tsx"))
    .toContain('import { CopyButtons } from "@ai-matrx/chat/host/ui-slots"');
  const slots = read("../aidream/apps/shared/chat/src/host/ui-slots.tsx");
  expect(slots).toContain('export const CopyButtons = slotComponent("CopyButtons"');
  expect(slots).not.toContain("InlineCopyButton");
  expect(read("providers/chatUiRegistrationBase.ts")).toContain("CopyButtons,");
});

test("the dynamic UI scope obtains the class recipe from the design-system root, not the control-only door", () => {
  const scope = read("components/ui/react-live-scope.ts");
  expect(scope).toContain('export { buttonVariants } from "@ai-matrx/design-system"');
  expect(scope).not.toContain('export { Button, buttonVariants } from "./button"');
});

test("there is one download door: Kit's, with no re-export beside it", () => {
  expect(read("components/agent-copy/export.ts")).not.toContain("downloadFile");
  expect(read("../aidream/apps/shared/chat/src/agent-copy/export.ts")).not.toContain("export function downloadFile");
});
