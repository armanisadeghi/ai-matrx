/**
 * Reads the LIVE entity registry instead of hardcoding a token list.
 *
 * This is the repo's truth-vs-code guard pattern (see
 * `db/schema_analysis` in aidream and `scripts/schema-check/`): the checker
 * asks the registry what doors exist rather than carrying its own stale copy.
 * Add an `hrefFor` to a token and this checker's severity ranking updates on
 * the next run with no edit here.
 *
 * Three things come from truth, not from this file: the TOKEN SET and which
 * tokens have a route (parsed out of the registry's own `ENTITY_OVERLAY`), the
 * LABEL each token carries (`ENTITY_TYPE_METADATA`, the generated
 * `platform.entity_types` mirror the registry itself merges) — which is the noun
 * a finding's remedy must speak — and which bare nouns are AMBIGUOUS across the
 * registered set.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";

const REGISTRY_PATH = "features/scopes/registry/entityRegistry.ts";

export interface EntityTokenInfo {
  token: string;
  hasRoute: boolean;
  /**
   * The registry's own singular label for this entity ("Calendar event",
   * "Project", "SEO Keyword"). Every remedy sentence names the entity with
   * THIS, never with another entity's noun: the toast rule used to print
   * `label: "Open the note"` for a project, a task and a keyword alike.
   * Falls back to the token's own words when the DB metadata has no label.
   */
  label: string;
}

/**
 * Nouns (and NOUN PHRASES) that appear in message and identifier text mapped to
 * the canonical token they refer to. Only entries whose token actually exists in
 * the registry survive `loadEntityTokens()`, so a renamed token drops out
 * instead of misreporting.
 *
 * Matching is on WHOLE camel/underscore segments (with a naive plural strip),
 * never substrings: `appName` must not be dragged in by `application`. A
 * multi-word key matches CONSECUTIVE segments and the LONGEST key wins, which
 * is what makes a qualified phrase beat the bare noun inside it:
 * `importGoogleDocument` / "Google document imported" is a `google_document`,
 * never the platform's own `udt_document`.
 *
 * DELIBERATELY ABSENT — words whose everyday meaning swamps the entity:
 *   `list` (any array), `page` (pagination), `store` (the Redux store),
 *   `session` (auth/chat sessions), `thread`, `doc`, `member`, `repo`.
 * A wrong token is worse than no token: it puts a confident, false entity name
 * on a finding and, when that token happens to own a route, promotes it to
 * high severity. Unmatched findings still report — just ranked lower.
 *
 * 🚨 ALSO DELIBERATELY ABSENT: `document`. Four registered entities end in that
 * word (`udt_document`, `google_document`, `working_document`,
 * `processed_document`), so the bare noun names none of them — it used to map to
 * `udt_document` and reported an imported Google file as the custom-data
 * document, a confident wrong record name (V-21). A bare noun that collides like
 * this is refused by `loadEntityTokens` unless it carries an explicit ruling in
 * `AMBIGUOUS_NOUN_RULINGS` below, so it cannot be added back by accident.
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
  // Google Workspace — QUALIFIED phrases only, for exactly the reason `document`
  // is gone: the word that names the record is "Google document" / "Google
  // file", never "document" (V-21, 2026-09-18).
  "calendar event": "calendar_event",
  "google document": "google_document",
  "google doc": "google_document",
  "google file": "google_document",
};

/**
 * Bare nouns that COLLIDE across the registered set and are nevertheless ruled
 * to mean one entity, with the reason. The ruling is the only way a colliding
 * bare noun resolves — `loadEntityTokens` throws when `NOUN_TO_TOKEN` carries
 * one without a ruling here, which is the guard that keeps the `document` class
 * from coming back under another word.
 */
const AMBIGUOUS_NOUN_RULINGS: Record<string, { token: string; reason: string }> = {
  file: {
    token: "file",
    reason:
      "The platform's own file. A `code_file` is spoken of as a 'code file' — " +
      "nobody writes 'File created' about one.",
  },
  folder: {
    token: "folder",
    reason:
      "The platform's own folder, same reading as `file`; a `code_folder` is a " +
      "'code folder'.",
  },
  task: {
    token: "task",
    reason:
      "A workspace task. A `sch_task` is always spoken of as a 'scheduled task' " +
      "and `components/official/entity-ref/doors.ts` resolves that phrase the " +
      "same way.",
  },
};

/** Words that are the plain head noun of more than one registered token. */
let ambiguousHeadNouns: Set<string> = new Set();

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
          out.set(token, { token, hasRoute, label: labelForToken(token) });
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

  ambiguousHeadNouns = computeAmbiguousHeadNouns(out);
  assertNoUnruledCollisions(out);
  return out;
}

/** The registry's label for a token, or the token's own words. */
function labelForToken(token: string): string {
  const meta = (ENTITY_TYPE_METADATA as Record<string, { label?: string } | undefined>)[
    token
  ];
  const label = meta?.label?.trim();
  return label && label.length > 0 ? label : token.replace(/_/g, " ");
}

/**
 * The head noun of every registered token, counted: a word that heads more than
 * one is AMBIGUOUS and names no single record. Derived from both the token and
 * its label, because either spelling is how prose reaches it
 * (`processed_document` / "Processed document").
 */
function computeAmbiguousHeadNouns(
  tokens: Map<string, EntityTokenInfo>,
): Set<string> {
  const byHead = new Map<string, Set<string>>();
  for (const info of tokens.values()) {
    for (const phrase of [info.token.replace(/_/g, " "), info.label]) {
      const head = headNoun(phrase);
      if (!head) continue;
      const set = byHead.get(head) ?? new Set<string>();
      set.add(info.token);
      byHead.set(head, set);
    }
  }
  const out = new Set<string>();
  for (const [head, owners] of byHead) if (owners.size > 1) out.add(head);
  return out;
}

function headNoun(phrase: string): string {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const last = words[words.length - 1] ?? "";
  return last.endsWith("s") && last.length > 3 ? last.slice(0, -1) : last;
}

/**
 * A bare noun in `NOUN_TO_TOKEN` that names several registered entities, with no
 * ruling saying which one it means, is the `document` → `udt_document` defect
 * again. Refuse the run rather than mis-attribute findings.
 */
function assertNoUnruledCollisions(tokens: Map<string, EntityTokenInfo>): void {
  const offenders: string[] = [];
  for (const noun of Object.keys(NOUN_TO_TOKEN)) {
    if (noun.includes(" ")) continue; // a qualified phrase is never the problem
    if (!ambiguousHeadNouns.has(noun)) continue;
    if (AMBIGUOUS_NOUN_RULINGS[noun]) continue;
    offenders.push(noun);
  }
  for (const [noun, ruling] of Object.entries(AMBIGUOUS_NOUN_RULINGS)) {
    if (!tokens.has(ruling.token)) continue;
    if (ambiguousHeadNouns.has(noun)) continue;
    throw new Error(
      `[dead-ends] "${noun}" is ruled in AMBIGUOUS_NOUN_RULINGS but names only one ` +
        `registered entity now — move it to NOUN_TO_TOKEN and delete the ruling ` +
        `(scripts/dead-ends/entity-tokens.ts).`,
    );
  }
  if (offenders.length > 0) {
    throw new Error(
      `[dead-ends] NOUN_TO_TOKEN maps the bare noun(s) ${offenders
        .map((n) => `"${n}"`)
        .join(", ")} to one token, but each names SEVERAL registered entities. ` +
        `That is the V-21 defect: a confident wrong record name. Either qualify ` +
        `the key ("google document") or add a ruling with its reason to ` +
        `AMBIGUOUS_NOUN_RULINGS (scripts/dead-ends/entity-tokens.ts).`,
    );
  }
}

/** The token a noun or phrase resolves to, honouring the rulings above. */
function tokenForNoun(noun: string): string | undefined {
  return AMBIGUOUS_NOUN_RULINGS[noun]?.token ?? NOUN_TO_TOKEN[noun];
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

/** What `inferTokenDetailed` saw: a token, or an honest "I cannot name this". */
export interface TokenInference {
  info: EntityTokenInfo | null;
  /**
   * The bare noun that named SEVERAL registered entities, when that is why
   * nothing resolved. The caller reports it rather than guessing a record.
   */
  ambiguousNoun: string | null;
}

/**
 * Infer a canonical entity token from an expression's identifier text.
 * `agentRow.agentName` / `row.agentName` / `agentName` all resolve to `agent`,
 * and `importGoogleDocument` resolves to `google_document` because the longest
 * matching phrase wins over the bare noun inside it.
 *
 * Returns `{ info: null }` when nothing in the text names a known entity — the
 * finding is still reported, just ranked lower — and additionally names the
 * ambiguous noun when the text DID reach a word that several registered entities
 * answer to. Guessing one of them is the defect this replaces.
 */
export function inferTokenDetailed(
  words: string[],
  tokens: Map<string, EntityTokenInfo>,
): TokenInference {
  // Longest phrase first, scanning left to right: `google document` before
  // `document`, `calendar event` before `event`.
  const MAX_PHRASE_WORDS = 3;
  for (let len = MAX_PHRASE_WORDS; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      for (const phrase of phraseCandidates(words.slice(i, i + len))) {
        const token = tokenForNoun(phrase);
        if (!token) continue;
        const info = tokens.get(token);
        if (info) return { info, ambiguousNoun: null };
      }
    }
  }
  for (const word of words) {
    for (const candidate of segmentCandidates(word)) {
      if (ambiguousHeadNouns.has(candidate) && !tokenForNoun(candidate)) {
        return { info: null, ambiguousNoun: candidate };
      }
    }
  }
  return { info: null, ambiguousNoun: null };
}

/** The token half of `inferTokenDetailed`, for callers with no use for the rest. */
export function inferToken(
  words: string[],
  tokens: Map<string, EntityTokenInfo>,
): EntityTokenInfo | null {
  return inferTokenDetailed(words, tokens).info;
}

/**
 * Every spelling of a run of words a noun key could take: each word reduced by
 * `segmentCandidates`, joined by a single space. One word in, one key out; three
 * words in, up to `3^3` keys — bounded and cheap.
 */
function phraseCandidates(words: string[]): string[] {
  let out: string[] = [""];
  for (const word of words) {
    const next: string[] = [];
    for (const prefix of out) {
      for (const candidate of segmentCandidates(word)) {
        next.push(prefix ? `${prefix} ${candidate}` : candidate);
      }
    }
    out = next;
  }
  return out;
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
 *
 * A multi-word noun comes back in BOTH spellings — "calendar event" for prose
 * and "calendarevent" for the identifier regexes that run case-insensitively
 * over source text (`createCalendarEvents.map(`) — because a caller cannot know
 * which shape it is matching against.
 */
export function nounsForToken(token: string): string[] {
  const out = new Set<string>();
  for (const [noun, value] of Object.entries(NOUN_TO_TOKEN)) {
    if (value !== token) continue;
    out.add(noun);
    if (noun.includes(" ")) out.add(noun.replace(/\s+/g, ""));
  }
  for (const [noun, ruling] of Object.entries(AMBIGUOUS_NOUN_RULINGS)) {
    if (ruling.token === token) out.add(noun);
  }
  return [...out];
}

/** Split an expression like `row.agentName` into lowercase word candidates. */
export function expressionWords(expression: string): string[] {
  return expression
    .split(/[^A-Za-z0-9]+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])/))
    .filter(Boolean);
}
