/**
 * check:registry-repaint — THE REPAINT SUBSCRIPTION MUST SURVIVE THE COMPILER.
 *
 * WHAT THIS GUARDS (DD-215c, observed on production 2026-09-14).
 *
 * Kind rendering reads module-singleton registries DURING RENDER and pairs each
 * read with `useContentIrKindVersion(kind)` — a subscription that returns that
 * kind's monotonic version. Four render seams then used that number the only
 * way a number can be used when the computation does not need it:
 *
 *     const v = useContentIrKindVersion(kind);
 *     const x = useMemo(() => { void v; return read(kind); }, [kind, v]);
 *
 * That is correct WITHOUT the React Compiler and silently wrong with it — and
 * `next.config.js` sets `reactCompiler: true`. The compiler re-infers
 * memoization from data flow; a `void`-ed value is not an input; the emitted
 * cache is keyed on `kind` alone. The subscription still fires, the component
 * still re-renders, and the read never re-runs. On `/shapes/<kind>/instances`
 * that handed readers the platform's bundled component in place of their
 * organization's authored one for the life of the mount, with nothing on
 * screen, no console error and no incident row.
 *
 * WHY A LINT RULE OR A JEST TEST CANNOT DO THIS JOB. Jest does not run the
 * React Compiler, so the defective source passes every unit test of the seam —
 * three lanes shipped fixes proven exactly that way and production disproved
 * each one. The only honest check is to run THE REAL COMPILER (the same
 * `babel-plugin-react-compiler` the build uses) over the real source and read
 * what it emits.
 *
 * THE RULE, checked on the compiled output of every file that calls the hook:
 *   the value `useContentIrKindVersion` returns must still be READ after its
 *   own declaration. A discarded call, or a binding the compiler keeps but
 *   nothing references, means the version invalidates nothing.
 *
 * Usage:
 *   tsx scripts/check-registry-repaint.ts            # the repo
 *   tsx scripts/check-registry-repaint.ts --self-test # prove it fails on the defect
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "@babel/core";

import { exitAfterDrain } from "./lib/exit-after-drain";

const REPO = path.resolve(__dirname, "..");
const HOOK = "useContentIrKindVersion";

/** Every hook in this family: a render-time subscription to a registry. */
const SUBSCRIPTION_HOOKS = [HOOK];

const COMPILER = require.resolve("babel-plugin-react-compiler");
const SYNTAX_TS = require.resolve("@babel/plugin-syntax-typescript");
const SYNTAX_JSX = require.resolve("@babel/plugin-syntax-jsx");

/** Compile one source exactly as the Next build's React Compiler pass would. */
function compileWithReactCompiler(source: string, filename: string): string {
  const out = transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [COMPILER, { target: "19" }],
      [SYNTAX_TS, { isTSX: true }],
      SYNTAX_JSX,
    ],
    compact: false,
    // 🚨 COMMENTS OFF. The rule reads the compiled output as CODE; the modules
    // that document this very defect quote `useContentIrKindVersion(kind)` in
    // their headers, and a guard that flags its own doctrine is a guard someone
    // switches off. Stripping them here is what makes the finding mean what it
    // says: a real call whose answer nothing reads.
    comments: false,
  });
  return out?.code ?? "";
}

interface Finding {
  file: string;
  detail: string;
}

/**
 * Does the compiled output still READ the value this hook returned?
 *
 * Two defective shapes, both reported:
 *  - `useContentIrKindVersion(x);` — the answer was thrown away outright.
 *  - `const v = useContentIrKindVersion(x);` with no later reference to `v` —
 *    the compiler kept the binding and nothing depends on it, so no memo it
 *    emitted is keyed on the version.
 */
function inspect(compiled: string, hook: string): string[] {
  const problems: string[] = [];
  const call = new RegExp(
    `(?:(const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*)?\\b${hook}\\s*\\(`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = call.exec(compiled)) !== null) {
    const binding = match[2];
    if (!binding) {
      problems.push(
        `the compiled output calls \`${hook}(…)\` and DISCARDS its answer, so the ` +
          `registry reads in that component are memoized on their own arguments ` +
          `and never re-run when a row lands`,
      );
      continue;
    }
    const uses = compiled.match(new RegExp(`\\b${binding}\\b`, "g")) ?? [];
    if (uses.length < 2) {
      problems.push(
        `the compiled output binds \`${binding} = ${hook}(…)\` and then never reads ` +
          `\`${binding}\` — the React Compiler dropped it from every memo it emitted, ` +
          `so the version invalidates nothing`,
      );
    }
  }
  return problems;
}

function trackedFilesCallingHook(): string[] {
  const listed = execFileSync(
    "git",
    ["grep", "-l", "-e", HOOK, "--", "*.ts", "*.tsx"],
    { cwd: REPO, encoding: "utf8" },
  );
  return listed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("scripts/"))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => !file.includes("__tests__/"))
    // The hook's own module declares it; there is nothing to invalidate there.
    .filter((file) => !file.endsWith("react/use-registry-repaint.ts"));
}

function run(): number {
  const files = trackedFilesCallingHook();
  if (files.length === 0) {
    console.error(
      `check-registry-repaint: found NO file calling ${HOOK}. That is not a pass — ` +
        `either the hook was renamed (update this guard in the same commit) or the ` +
        `search is broken. Refusing to report green on an unmeasured repo.`,
    );
    return 1;
  }
  const findings: Finding[] = [];
  for (const file of files) {
    const absolute = path.join(REPO, file);
    let compiled: string;
    try {
      compiled = compileWithReactCompiler(readFileSync(absolute, "utf8"), absolute);
    } catch (error) {
      findings.push({
        file,
        detail: `could not be compiled with the React Compiler, so it is UNMEASURED: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    for (const hook of SUBSCRIPTION_HOOKS) {
      for (const problem of inspect(compiled, hook)) {
        findings.push({ file, detail: problem });
      }
    }
  }
  if (findings.length > 0) {
    console.error(
      "check-registry-repaint: DD-215c is reopening — a registry repaint that the React Compiler erases.\n",
    );
    for (const finding of findings) {
      console.error(`  - ${finding.file}: ${finding.detail}`);
    }
    console.error(
      `\n  What this means for a reader: the component keeps whatever the registry` +
        `\n  answered at mount. On production this showed the platform's bundled` +
        `\n  component where the organization's authored one belonged, silently, for` +
        `\n  the life of the mount.` +
        `\n\n  The fix: pass the version AS AN ARGUMENT to the read —` +
        `\n  routeBlockAtRegistryVersion(block, version), or readAtVersionForKey(cache,` +
        `\n  key, version, () => read()). See features/content-ir/react/registry-versioned.ts.`,
    );
    return 1;
  }
  console.log(
    `check-registry-repaint: OK — ${files.length} file(s) call ${HOOK}, and in every ` +
      `one the React Compiler's own output still reads the version, so a row landing ` +
      `after mount re-runs the registry read.`,
  );
  return 0;
}

/**
 * THE SELF-TEST. A guard nobody has seen fail is not a guard: this replays both
 * defective shapes (the exact `void version;` idiom that shipped, and the bare
 * discarded call) plus the fixed shape, through the real compiler.
 */
function selfTest(): number {
  const cases: Array<{ name: string; source: string; mustFail: boolean }> = [
    {
      name: "the shipped defect — `void version;` as a memo invalidation key",
      mustFail: true,
      source: `
import { useMemo } from "react";
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { readIt } from "./registry";
export function Broken({ subject }: { subject: { kind: string } }) {
  const version = useContentIrKindVersion(subject.kind);
  const answer = useMemo(() => {
    void version;
    return readIt(subject);
  }, [subject, version]);
  return <div>{String(answer)}</div>;
}
`,
    },
    {
      name: "the other defect — the subscription's answer discarded outright",
      mustFail: true,
      source: `
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { readIt } from "./registry";
export function AlsoBroken({ subject }: { subject: { kind: string } }) {
  useContentIrKindVersion(subject.kind);
  const answer = readIt(subject);
  return <div>{String(answer)}</div>;
}
`,
    },
    {
      name: "a module that only QUOTES the defect in its documentation",
      mustFail: false,
      source: `
/**
 * The rule. Never write this:
 *     const v = useContentIrKindVersion(kind);
 *     const x = useMemo(() => { void v; return read(kind); }, [kind, v]);
 * and never call useContentIrKindVersion(kind) for its side effect alone.
 */
export function readAtVersion<T>(version: number, read: () => T): T {
  void version;
  return read();
}
`,
    },
    {
      name: "the fix — the version is an argument to the read",
      mustFail: false,
      source: `
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { readAtVersion } from "./registry";
export function Fixed({ subject }: { subject: { kind: string } }) {
  const version = useContentIrKindVersion(subject.kind);
  const answer = readAtVersion(subject, version);
  return <div>{String(answer)}</div>;
}
`,
    },
  ];
  let failures = 0;
  for (const testCase of cases) {
    const compiled = compileWithReactCompiler(
      testCase.source,
      path.join(REPO, "features/content-ir/react/__self_test__.tsx"),
    );
    const problems = inspect(compiled, HOOK);
    const flagged = problems.length > 0;
    const ok = flagged === testCase.mustFail;
    console.log(
      `[self-test] ${ok ? "PASS" : "FAIL"} — ${testCase.name}: ${
        flagged ? `flagged (${problems[0]})` : "clean"
      }`,
    );
    if (!ok) failures += 1;
  }
  if (failures > 0) {
    console.error(
      "[self-test] FAIL — the rule does not separate the defect from the fix. " +
        "It cannot be trusted to hold DD-215c closed.",
    );
    return 1;
  }
  console.log(
    "[self-test] PASS — the rule fails on both shapes of the defect and passes on the fix.",
  );
  return 0;
}

exitAfterDrain(process.argv.includes("--self-test") ? selfTest() : run());
