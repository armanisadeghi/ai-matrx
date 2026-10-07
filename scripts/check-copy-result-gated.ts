/**
 * A copied state or success toast must follow a clipboard write that returned
 * true. The AST implementation resolves both hook-bound and standalone Kit
 * clipboard methods across every authored TypeScript source file.
 *
 * It also holds the other half of that contract: the kit copy never throws,
 * so failure handling lives in the `false` branch (never a catch), and a
 * failed copy never skips closing, navigating or a caller's callback.
 */
import {
  census,
  doorMisuse,
  selfTest,
  violations,
} from "./check-clipboard-success-gating";

function main(): number {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return 0;
  }

  const calls = census();
  const failures = violations(calls);
  const misuse = doorMisuse();
  const discarded = calls.filter((call) => call.kind !== "other");
  console.log(
    JSON.stringify(
      {
        files: new Set(calls.map((call) => call.file)).size,
        calls: calls.length,
        byKind: Object.fromEntries(
          [
            "await-discarded",
            "promise-discarded",
            "then-result-ignored",
            "menu-result-forwarded",
            "other",
          ].map((kind) => [
            kind,
            calls.filter((call) => call.kind === kind).length,
          ]),
        ),
        violations: failures,
        doorMisuse: misuse,
        discardedWithoutSeparateSuccess: discarded.length - failures.length,
      },
      null,
      2,
    ),
  );
  return failures.length || misuse.length ? 1 : 0;
}

process.exitCode = main();
