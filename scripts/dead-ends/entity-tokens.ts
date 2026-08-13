/**
 * Reads the LIVE entity registry instead of hardcoding a token list.
 *
 * This is the repo's truth-vs-code guard pattern (see
 * `db/schema_analysis` in aidream and `scripts/schema-check/`): the checker
 * asks the registry what doors exist rather than carrying its own stale copy.
 * Add an `hrefFor` to a token and this checker's severity ranking updates on
 * the next run with no edit here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const REGISTRY_PATH = "features/scopes/registry/entityRegistry.ts";

export interface EntityTokenInfo {
  token: string;
  hasRoute: boolean;
}

/**
 * Nouns that appear in variable names mapped to the canonical token they
 * refer to. Only entries whose token actually exists in the registry survive
 * `loadEntityTokens()`, so a renamed token drops out instead of misreporting.
 *
 * Matching is on WHOLE camel/underscore segments (with a naive plural strip),
 * never substrings: `appName` must not be dragged in by `application`.
 * Substring matching mis-attributed 32 findings to the agent-apps token on
 * the first run.
 *
 * DELIBERATELY ABSENT — words whose everyday meaning swamps the entity:
 *   `list` (any array), `page` (pagination), `store` (the Redux store),
 *   `session` (auth/chat sessions), `thread`, `doc`, `member`, `repo`.
 * A wrong token is worse than no token: it puts a confident, false entity name
 * on a finding and, when that token happens to own a route, promotes it to
 * high severity. Unmatched findings still report — just ranked lower.
 */
const NOUN_TO_TOKEN: Record<string, string> = {
  agent: "agent",
  shortcut: "agent_shortcut",
  app: "app",
  skill: "skill",
  workflow: "workflow",
  picklist: "structured_list",
  file: "file",
  folder: "folder",
  transcript: "transcript",
  dataset: "dataset",
  workbook: "workbook",
  note: "note",
  document: "udt_document",
  conversation: "conversation",
  chat: "conversation",
  project: "project",
  task: "task",
  party: "party",
  contact: "party",
  keyword: "seo_keyword",
  scope: "scope",
  organization: "organization",
  org: "organization",
  flashcard: "flashcard_set",
  quiz: "quiz_session",
  repository: "code_repository",
};

/** Parse the registry's overlay object for tokens and which carry `hrefFor`. */
export function loadEntityTokens(repoRoot: string): Map<string, EntityTokenInfo> {
  const out = new Map<string, EntityTokenInfo>();
  let src: string;
  try {
    src = readFileSync(join(repoRoot, REGISTRY_PATH), "utf8");
  } catch {
    // A moved registry must be LOUD, never a silently empty token map that
    // downgrades every finding to "unknown entity".
    throw new Error(
      `[dead-ends] Cannot read ${REGISTRY_PATH}. The entity registry moved — ` +
        `update REGISTRY_PATH in scripts/dead-ends/entity-tokens.ts.`,
    );
  }

  const sf = ts.createSourceFile(
    REGISTRY_PATH,
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "ENTITY_OVERLAY" &&
      node.initializer
    ) {
      const obj = unwrapObjectLiteral(node.initializer);
      if (obj) {
        for (const prop of obj.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const token = propertyName(prop.name);
          if (!token) continue;
          const value = prop.initializer;
          const hasRoute =
            ts.isObjectLiteralExpression(value) &&
            value.properties.some(
              (p) =>
                (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                propertyName(p.name) === "hrefFor",
            );
          out.set(token, { token, hasRoute });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (out.size === 0) {
    throw new Error(
      `[dead-ends] Parsed ${REGISTRY_PATH} but found no ENTITY_OVERLAY entries. ` +
        `The registry's shape changed — fix scripts/dead-ends/entity-tokens.ts.`,
    );
  }
  return out;
}

function unwrapObjectLiteral(node: ts.Expression): ts.ObjectLiteralExpression | null {
  let cur: ts.Node = node;
  while (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression;
  }
  return ts.isObjectLiteralExpression(cur) ? cur : null;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Infer a canonical entity token from an expression's identifier text.
 * `agentRow.agentName` / `row.agentName` / `agentName` all resolve to `agent`.
 * Returns null when nothing in the text names a known entity — the finding is
 * still reported, just ranked lower.
 */
export function inferToken(
  words: string[],
  tokens: Map<string, EntityTokenInfo>,
): EntityTokenInfo | null {
  for (const word of words) {
    for (const candidate of segmentCandidates(word)) {
      const token = NOUN_TO_TOKEN[candidate];
      if (!token) continue;
      const info = tokens.get(token);
      if (info) return info;
    }
  }
  return null;
}

/**
 * The forms one identifier segment may take: itself, its naive singular
 * (`agents` → `agent`), and — for all-lowercase compounds that camelCase
 * splitting cannot separate — a leading-noun match (`filename` → `file`,
 * `docid` → `doc`). Without the last case `fileName` matched and `filename`
 * silently did not, which quietly dropped real findings.
 */
function segmentCandidates(word: string): string[] {
  const lower = word.toLowerCase();
  const out = [lower];
  if (lower.endsWith("s") && lower.length > 2) out.push(lower.slice(0, -1));
  for (const suffix of ["name", "title", "id", "label", "slug"]) {
    if (lower.length > suffix.length && lower.endsWith(suffix)) {
      out.push(lower.slice(0, -suffix.length));
    }
  }
  return out;
}

/**
 * Every noun that resolves to a token — used to build an entity-SCOPED
 * "is the id in scope?" oracle. Without it, any `<root>.<anything>Id` counted,
 * so `requestId` on an upload or `instanceId` on a debug panel satisfied the
 * gate for a completely unrelated record.
 */
export function nounsForToken(token: string): string[] {
  return Object.entries(NOUN_TO_TOKEN)
    .filter(([, value]) => value === token)
    .map(([noun]) => noun);
}

/** Split an expression like `row.agentName` into lowercase word candidates. */
export function expressionWords(expression: string): string[] {
  return expression
    .split(/[^A-Za-z0-9]+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])/))
    .filter(Boolean);
}
