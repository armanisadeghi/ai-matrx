// node --test scripts/lint-rules/hand-built-chip.selftest.mjs — the chip rule fires on the
// hand-built tinted chips the owner named and stays quiet on THE chip, icon tiles and plain text.
import test from "node:test";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { noHandBuiltChip } from "./hand-built-chip.mjs";

const tester = new RuleTester({ languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } } });

test("matrx/no-hand-built-chip", () => {
  tester.run("no-hand-built-chip", noHandBuiltChip, {
    valid: [
      { code: '<Chip tone="sky" label="Flashcards" />' },
      { code: '<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary" />' },
      { code: '<p className="text-xs text-muted-foreground">x</p>' },
      { code: '<span className="rounded-md border border-border px-2 text-xs text-muted-foreground">x</span>' },
      { code: '<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">Failed</div>' },
    ],
    invalid: [
      { code: '<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Live</span>', errors: [{ messageId: "chip" }] },
      { code: '<Link className={cn("inline-flex min-h-7 rounded-md px-2 text-[11px] font-medium", "bg-sky-500/10 text-sky-600 dark:text-sky-400")} />', errors: [{ messageId: "chip" }] },
      { code: '<span className="inline-flex rounded-full bg-warning/10 px-2.5 text-xs font-semibold text-warning">3 due</span>', errors: [{ messageId: "chip" }] },
    ],
  });
});
