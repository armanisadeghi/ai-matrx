/**
 * "A problem you can detect ships with its one-click fix."
 *
 * The doctrine's second corollary applied to the detector itself: every row on
 * the dashboard hands the operator a ready-to-paste agent brief, so seeing a
 * dead end and dispatching its repair is one click, not a research task. This
 * is the assist-shaped affordance for this surface (`features/assists/`
 * FEATURE.md — ask "could an AI button do this?" before designing a manual one).
 */

import { describeFinding } from "@/scripts/dead-ends/describe";
import type { DeadEndFinding } from "@/scripts/dead-ends/types";
import { ENTITY_REGISTRY_PATH } from "./source-links";

const DOCTRINE = "common-docs/policies/no-dead-ends.md";

/**
 * Repo paths carry route-group parentheses (`app/(admin)/…`), which bash reads
 * as subshell syntax. Every path we paste into a shell command is quoted, or
 * the verify step in the brief silently runs the wrong thing.
 */
function shellPath(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * The verify line for a scope. A whole-repo sweep has no prefix — passing a
 * prose label as `--path` produced `--path=the whole repository`, which matches
 * nothing and reports a clean tree.
 */
function verifyCommand(pathPrefix: string | null): string {
  return pathPrefix
    ? `pnpm check:dead-ends --path=${shellPath(pathPrefix)}`
    : "pnpm check:dead-ends";
}

/** Brief for repairing ONE finding. */
export function fixPromptForFinding(f: DeadEndFinding): string {
  return [
    `Read ${DOCTRINE} and invoke the \`no-dead-ends\` skill, then fix this Door Law violation.`,
    "",
    `File:       ${f.file}:${f.line}:${f.column}`,
    `Rule:       ${f.rule} (${f.severity})`,
    `Entity:     ${f.entity}${f.entityHasRoute ? " (has a route in the entity registry)" : " (NO hrefFor in the entity registry yet)"}`,
    `Expression: ${f.expression}`,
    f.route ? `Route:      ${f.route}` : null,
    "",
    describeFinding(f),
    "",
    "Rules of engagement:",
    "- The door primitive is <EntityRef token=… id=… name=… /> " +
      "(components/official/entity-ref/EntityRef.tsx). Never hand-roll a name link.",
    `- A missing door is usually a missing hrefFor — fix ${ENTITY_REGISTRY_PATH}, not the call site.`,
    "- Run the inventory pass first and name in your summary what you searched, " +
      "found, reused, or newly built.",
    "- If this is genuinely NOT a violation, add it to scripts/dead-ends/allowlist.ts " +
      "WITH A REASON rather than deleting the check.",
    `- Verify with \`${verifyCommand(f.file)}\` before reporting done.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Brief for sweeping every finding in one file or feature bucket. */
export function fixPromptForBucket(
  bucketLabel: string,
  findings: DeadEndFinding[],
  scope: "file" | "feature",
  /** Path prefix to verify against. `null` for a whole-repo sweep. */
  pathPrefix: string | null = bucketLabel,
): string {
  const lines = findings
    .slice(0, 60)
    .map(
      (f) =>
        `  - ${f.file}:${f.line} [${f.rule}/${f.severity}] ${f.entity} — ${f.expression}`,
    );
  const truncated = findings.length > 60 ? `\n  … and ${findings.length - 60} more` : "";
  return [
    `Read ${DOCTRINE} and invoke the \`no-dead-ends\` skill, then clear every Door Law`,
    `violation in this ${scope}: ${bucketLabel}`,
    "",
    `${findings.length} finding(s):`,
    ...lines,
    truncated,
    "",
    "Do the inventory pass ONCE for the whole bucket, then fix them together:",
    "- Reach for <EntityRef> (components/official/entity-ref/EntityRef.tsx) for every name and id.",
    `- Missing route? Add hrefFor to the token in ${ENTITY_REGISTRY_PATH}.`,
    "- Missing peek? features/organizations/peek/registry.ts + kinds-list.ts, together.",
    "- A count is a door: link it to the filtered list.",
    "- Genuinely-correct code goes in scripts/dead-ends/allowlist.ts WITH A REASON.",
    `- Verify with \`${verifyCommand(pathPrefix)}\`,`,
    "  then refresh the scoreboard: `pnpm check:dead-ends:write` and commit the report.",
  ].join("\n");
}
