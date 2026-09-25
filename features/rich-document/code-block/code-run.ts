// features/rich-document/code-block/code-run.ts
//
// "Run" for a code block rides the platform's EXISTING execution path — the
// conversation's bound sandbox and `/api/sandbox/<id>/exec` (the same route
// the /code terminal's SandboxProcessAdapter uses). No binding, or a language
// with no interpreter there → the action is absent, never dead.
//
// The code travels as STDIN to a fixed interpreter command, never spliced
// into the command line, so nothing in the code can escape the shell.

import type { ExecutionInstance } from "@/features/agents/types/instance.types";
import type { ProcessResult } from "@/features/code/types";

type SandboxBinding = NonNullable<ExecutionInstance["sandboxBinding"]>;

const INTERPRETERS: Record<string, string> = {
  python: "python3 -",
  python3: "python3 -",
  py: "python3 -",
  javascript: "node -",
  js: "node -",
  node: "node -",
  mjs: "node -",
  bash: "bash -s",
  sh: "bash -s",
  shell: "bash -s",
  zsh: "bash -s",
};

/** The fixed stdin interpreter for a fence language, or null when none. */
export function runCommandFor(language: string | null | undefined): string | null {
  if (!language) return null;
  return INTERPRETERS[language.trim().toLowerCase()] ?? null;
}

/** The orchestrator sandbox a conversation is bound to, when it can exec. */
export function runnableSandboxId(
  binding: SandboxBinding | null | undefined,
): string | null {
  if (!binding?.rowId) return null;
  // A local PC target resolves its URL server-side at send time; the exec
  // route addresses orchestrator sandboxes only.
  if (binding.kind === "local-pc") return null;
  return binding.rowId;
}

export interface CodeRunResult extends ProcessResult {
  command: string;
  durationMs: number;
}

/** Execute the code in the bound sandbox. Throws with the server's reason. */
export async function runCodeInSandbox(args: {
  sandboxId: string;
  language: string;
  code: string;
  timeoutSec?: number;
}): Promise<CodeRunResult> {
  const command = runCommandFor(args.language);
  if (!command) throw new Error(`No interpreter for ${args.language}`);
  const { SandboxProcessAdapter } = await import(
    "@/features/code/adapters/SandboxProcessAdapter"
  );
  const adapter = new SandboxProcessAdapter(args.sandboxId);
  const started = performance.now();
  const result = await adapter.exec(command, {
    stdin: args.code,
    timeoutSec: args.timeoutSec ?? 60,
  });
  return { ...result, command, durationMs: Math.round(performance.now() - started) };
}
