// node --test scripts/lint-rules/one-control.selftest.mjs — the editor rules fire on the planted
// faults and stay quiet on placement-only use.
import test from "node:test";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { noStyledRawButton, oneControl } from "./one-control-rule.mjs";

const tester = new RuleTester({ languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } } });
const IMPORT = 'import { Button, Field } from "@ai-matrx/design-system/controls";\n';

test("matrx/one-control", () => {
  tester.run("one-control", oneControl, {
    valid: [
      { code: `${IMPORT}<Button className="w-full flex-1 ml-auto">Save</Button>` },
      { code: `${IMPORT}<Field className="w-44" style={{ width: "11rem" }} />` },
      { code: '<div className="ucx flex">x</div>' },
      { code: 'import { ControlRow } from "@ai-matrx/design-system/controls";\n<ControlRow className="border-b px-3">x</ControlRow>' },
    ],
    invalid: [
      { code: '<button className="uc-btn uc-btn-primary">New</button>', errors: [{ messageId: "prototype" }] },
      { code: 'const c = cn("uc-row", open && "px-2");', errors: [{ messageId: "prototype" }] },
      { code: `${IMPORT}<Button className="h-9 px-6 text-sm">Save</Button>`, errors: [{ messageId: "override" }] },
      { code: `${IMPORT}<Button className="bg-red-500">Save</Button>`, errors: [{ messageId: "override" }] },
      { code: `${IMPORT}<Field style={{ height: 40 }} />`, errors: [{ messageId: "override" }] },
    ],
  });
});

test("matrx/no-styled-raw-button", () => {
  tester.run("no-styled-raw-button", noStyledRawButton, {
    valid: [{ code: '<button className="flex-1 truncate">x</button>' }, { code: "<button>x</button>" }],
    invalid: [{ code: '<button className="h-8 rounded-md px-3 bg-primary">x</button>', errors: [{ messageId: "raw" }] }],
  });
});
