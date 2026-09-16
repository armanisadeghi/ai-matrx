/**
 * The pty harness for `scripts/__tests__/chair-step-confirmation.test.ts`.
 *
 * It is a separate process on purpose: `process.stdin.isTTY` is a property of the
 * PROCESS, so the only honest way to test the TTY branch is to BE a process with a
 * terminal — which `script(1)` gives us — and the only honest way to test the
 * non-TTY branch is to be one without.
 *
 *   node --import tsx chair-step-harness.ts <filename> <why>
 *
 * Prints exactly one line: `RESULT <json>` where the json is the refusal string or
 * null. Nothing else goes to stdout except the prompt the function itself writes.
 */
import { confirmChairStep } from "../../lib/chair-step";

async function main(): Promise<void> {
  const [filename, why] = process.argv.slice(2);
  const result = await confirmChairStep(filename ?? "(none)", why ?? "(none)");
  process.stdout.write(`\nRESULT ${JSON.stringify(result)}\n`);
  process.exit(0);
}

void main();
