// Self-test for matrx/no-canonical-component-override (owner, /agents/all 2026-10-04).
//   node --test scripts/lint-rules/no-canonical-component-override.selftest.mjs
// Every `invalid` case is a shape that lived in lib/entity-list before 2026-10-04 (the page
// re-styling the canonical table); every `valid` case must stay legal.
import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { noCanonicalComponentOverride as rule } from "./no-canonical-component-override.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
  },
});

const file = "/repo/lib/entity-list/components/EntityListTable.tsx";
const imp = 'import { MatrxDataTable } from "@ai-matrx/design-system/data-table";\n';

tester.run("no-canonical-component-override", rule, {
  valid: [
    // the package's own options
    { filename: file, code: `${imp}<MatrxDataTable data={rows} density="condensed" frameHeight="content" emptyHeader="hide" />;` },
    // a host's own element, its own classes
    { filename: file, code: '<div className="ml-auto flex min-w-0 shrink-0 items-center empty:hidden" />;' },
    // a host's own descendant hook (not a package internal)
    { filename: file, code: '<div className="contents [&_[data-row-id]:focus-visible]:bg-accent" />;' },
    // a host's own raw table styling its own cells
    { filename: file, code: '<tbody className="[&_td]:py-1.5 [&_tr:last-child]:border-0" />;' },
    // the package's declared per-row presentation hook
    { filename: file, code: `${imp}<MatrxDataTable data={rows} rowClassName={(r) => (r.dim ? "opacity-60" : undefined)} />;` },
    // a same-named component that is not the package's
    { filename: file, code: 'import { MatrxDataTable } from "./local";\n<MatrxDataTable className="h-auto" />;' },
    // the package itself, and tests
    { filename: "/repo/aidream/apps/shared/design-system/src/data-table/TableTitleRow.tsx", code: '<div className="[&_[data-matrx-table-tabs]]:border-b-0" />;' },
    { filename: "/repo/lib/entity-list/__tests__/x.test.tsx", code: '<div className="[&_thead]:hidden" />;' },
  ],
  invalid: [
    // lib/entity-list/components/EntityListTable.tsx (density + size-to-content + empty header)
    {
      filename: file,
      code: `${imp}<MatrxDataTable data={rows} className={cn(compact && "text-xs [&_td]:py-1 [&_th]:py-1")} tableClassName={cn("h-auto max-h-full", empty && "[&_thead]:hidden")} />;`,
      errors: [{ messageId: "classProp" }, { messageId: "reach" }, { messageId: "classProp" }, { messageId: "reach" }],
    },
    // lib/entity-list/components/EntityListToolbar.tsx (the table-controls slot)
    {
      filename: file,
      code: '<div className="flex min-w-0 [&>*]:w-auto [&_[data-matrx-table-toolbar]]:flex-nowrap sm:[&_[data-matrx-table-toolbar-tabs]]:max-w-[14rem] [&_[data-matrx-table-tabs]]:border-b-0" />;',
      errors: [{ messageId: "reach" }],
    },
    // a class helper built outside JSX
    { filename: file, code: 'const c = cn("flex", "[&_tbody_tr]:h-8");', errors: [{ messageId: "reach" }] },
    // a class prop on another canonical component
    { filename: file, code: 'import { TableViewTabs } from "@ai-matrx/design-system/data-table";\n<TableViewTabs className="border-0" />;', errors: [{ messageId: "classProp" }] },
  ],
});
