/**
 * A copied state or success toast must follow a clipboard write that returned
 * true. The AST implementation resolves both hook-bound and standalone Kit
 * clipboard methods across every authored TypeScript source file.
 */
import {
  census,
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
        discardedWithoutSeparateSuccess: discarded.length - failures.length,
      },
      null,
      2,
    ),
  );
  return failures.length ? 1 : 0;
}

process.exitCode = main();
