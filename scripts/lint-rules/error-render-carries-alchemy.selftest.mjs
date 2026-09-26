// Self-test for matrx/error-render-carries-alchemy (RC-B12, 2026-09-26).
//   node --test scripts/lint-rules/error-render-carries-alchemy.selftest.mjs
// The invalid cases are the shapes that landed without the menu (CheckFindingsConsole's
// LoadError, be840e5e43); the valid ones are the carried forms the rule must accept.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { errorRenderCarriesAlchemy as rule } from "./error-render-carries-alchemy.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inFeatures = path.join(ROOT, "features/selftest/Example.tsx");
const inTest = path.join(ROOT, "features/selftest/__tests__/Example.test.tsx");
const uncarried = [{ messageId: "uncarried" }];

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
  },
});

tester.run("error-render-carries-alchemy", rule, {
  valid: [
    {
      filename: inFeatures,
      code: `export function A({ error }: any) { return <ErrorNotice title="Could not read tasks" error={error} />; }`,
    },
    {
      filename: inFeatures,
      code: `export function A({ message }: any) { return <div className="border-destructive/40"><p>Could not read tasks.</p><p>{message}<ErrorAlchemyMenu error={message} /></p></div>; }`,
    },
    {
      // Test files are not screens.
      filename: inTest,
      code: `export function A({ error }: any) { return <p className="text-destructive">{error}</p>; }`,
    },
  ],
  invalid: [
    {
      filename: inFeatures,
      code: `export function LoadError({ what, message }: any) { return (<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3"><p className="font-medium text-destructive">Could not read {what}.</p><p>{message}</p></div>); }`,
      errors: uncarried,
    },
    {
      filename: inFeatures,
      code: `export function A({ error }: any) { return <EmptyState title="Nothing here" description={error} />; }`,
      errors: uncarried,
    },
    {
      filename: inFeatures,
      code: `export function A({ error }: any) { return <span className="text-muted-foreground" title={error}>Failed</span>; }`,
      errors: uncarried,
    },
  ],
});
