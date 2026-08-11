/**
 * "A problem you can detect ships with its one-click fix."
 *
 * Every row on the lint-debt scoreboard hands the operator a ready-to-paste
 * agent brief. The briefs carry the two rules that matter more than the lint
 * itself, because both have been violated here before:
 *
 *   1. NO MASS `eslint-disable`. That converts a visible backlog into an
 *      invisible one, which is strictly worse than the backlog.
 *   2. NO React Compiler config changes. `reactCompiler: true` is settled
 *      doctrine (CLAUDE.md); most of these findings ARE the compiler's
 *      correctness lint, and turning it off is not a fix.
 */

import {
  CLASS_DOCTRINE,
  CLASS_TITLES,
  classOf,
  type LintDebtFinding,
} from "@/scripts/lint-debt/types";

/**
 * Repo paths carry route-group parentheses (`app/(admin)/…`), which bash reads
 * as subshell syntax. Every path pasted into a shell command is quoted, or the
 * verify step in the brief silently runs the wrong thing.
 */
function shellPath(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

function verifyCommand(pathPrefix: string | null): string {
  return pathPrefix
    ? `pnpm check:lint-debt --path=${shellPath(pathPrefix)}`
    : "pnpm check:lint-debt";
}

/** The rules of engagement every brief carries, whatever its scope. */
const GROUND_RULES = [
  "Rules of engagement (non-negotiable):",
  "- DO NOT add eslint-disable comments to clear these. A silenced backlog is worse",
  "  than a visible one. If a rule is genuinely wrong for this codebase, argue it and",
  "  change eslint.config.mjs ONCE, with a comment explaining why.",
  "- DO NOT touch React Compiler config. `reactCompiler: true` is settled doctrine",
  "  (CLAUDE.md); these findings are largely its correctness lint.",
  "- DO NOT mass-convert React.lazy → next/dynamic while cleaning imports. That exact",
  "  move OOM-killed 14 production builds — read the `code-splitting` skill rule 3",
  "  before touching ANY import boundary, including no-restricted-imports findings.",
  "- Verify the surface still renders. preview_start name \"next-dev\", log in at /login.",
];

/** Rule-specific guidance — what a correct fix for this class looks like. */
const RULE_GUIDANCE: Record<string, string[]> = {
  "react/jsx-key": [
    "- Give each element in the array a STABLE key from the data (an id), never the",
    "  array index — an index key reintroduces the same reconciliation bug on reorder.",
  ],
  "react-hooks/rules-of-hooks": [
    "- Hoist every hook above the early return / condition / loop, then branch on the",
    "  RESULT. Never wrap a hook in a condition to 'skip work' — pass a disabled flag",
    "  into the hook instead.",
    "- If the component is really two components, split it — that is usually the honest fix.",
  ],
  "react-hooks/set-state-in-effect": [
    "- This is the cascading-render class that has frozen whole browsers here. Read",
    "  features/notes/FEATURE.md § Freeze-loop doctrine before editing.",
    "- Preferred fixes, in order: derive the value during render instead of storing it;",
    "  move the write into the event handler that caused it; key the component to reset",
    "  state. An effect that setStates on data it just changed is the loop.",
  ],
  "react-hooks/refs": [
    "- Refs may not be read or written during render. Move the access into an effect or",
    "  an event handler, or use useState if the value should drive rendering.",
  ],
  "react-hooks/static-components": [
    "- A component defined inside another is a NEW type every render: the subtree",
    "  unmounts and remounts, losing state, focus and scroll. Hoist it to module scope",
    "  and pass what it needs as props.",
  ],
  "@next/next/no-html-link-for-pages": [
    "- Use <Link href=…> from next/link. A raw <a> to an internal route does a full",
    "  document load: client state lost, no prefetch, transitions skipped.",
  ],
  "@next/next/no-assign-module-variable": [
    "- Rename the local binding. `module` is a real binding in the CommonJS wrapper",
    "  Next emits, and assigning it can break the chunk at runtime.",
  ],
  "no-restricted-imports": [
    "- This is a doctrine ban, not style. Change WHAT is imported, never silence it.",
    "  The message names the canonical path to use instead.",
  ],
};

function guidanceFor(rules: string[]): string[] {
  const out: string[] = [];
  for (const rule of [...new Set(rules)]) {
    const lines = RULE_GUIDANCE[rule];
    if (!lines) continue;
    out.push(`For ${rule}:`, ...lines);
  }
  return out;
}

/** Brief for repairing ONE finding. */
export function fixPromptForFinding(f: LintDebtFinding): string {
  const klass = classOf(f.rule);
  return [
    `Fix this ESLint finding in matrx-frontend. It is classified "${klass}" — ${CLASS_TITLES[klass]}.`,
    "",
    `File:    ${f.file}:${f.line}:${f.column}`,
    `Rule:    ${f.rule}`,
    f.route ? `Route:   ${f.route}` : null,
    `Message: ${f.message}`,
    "",
    CLASS_DOCTRINE[klass],
    "",
    ...guidanceFor([f.rule]),
    "",
    ...GROUND_RULES,
    `- Verify with \`${verifyCommand(f.file)}\` before reporting done.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Brief for sweeping every finding in one file, feature, or rule bucket. */
export function fixPromptForBucket(
  bucketLabel: string,
  findings: LintDebtFinding[],
  scope: "file" | "feature" | "rule" | "repository",
  /** Path prefix to verify against. `null` when the bucket is not a path. */
  pathPrefix: string | null = scope === "file" || scope === "feature" ? bucketLabel : null,
): string {
  const lines = findings
    .slice(0, 60)
    .map((f) => `  - ${f.file}:${f.line} [${f.rule}] ${f.message.slice(0, 120)}`);
  const truncated = findings.length > 60 ? `  … and ${findings.length - 60} more` : null;
  const klasses = [...new Set(findings.map((f) => classOf(f.rule)))];

  return [
    scope === "repository"
      ? `Clear ESLint findings across ${bucketLabel} in matrx-frontend.`
      : `Clear every ESLint finding in this ${scope}: ${bucketLabel}`,
    "",
    `${findings.length} finding(s), classes: ${klasses.map((k) => CLASS_TITLES[k]).join(", ")}.`,
    ...lines,
    truncated,
    "",
    ...klasses.map((k) => `${CLASS_TITLES[k]}: ${CLASS_DOCTRINE[k]}`),
    "",
    ...guidanceFor(findings.map((f) => f.rule)),
    "",
    ...GROUND_RULES,
    `- Verify with \`${verifyCommand(pathPrefix)}\`,`,
    "  then refresh the scoreboard: `pnpm check:lint-debt:write` and commit the snapshot.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
