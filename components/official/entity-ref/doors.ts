/**
 * Door resolution — the ONE place a (token, id) pair becomes reachable doors.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it. Two
 * different presentations need the same answer:
 *
 *   `EntityRef`      — a NAME with doors (the default; prefer it always)
 *   `MatrxUuidCell`  — an ID with doors (only when the name genuinely isn't
 *                      loaded — a raw FK column in a dense admin table)
 *
 * Both call `resolveEntityDoors`, so a registry edit lights up both at once and
 * neither can drift from the other. This module is deliberately component-free
 * and cheap to import: it pulls the entity registry (icons + `hrefFor`) and the
 * peek KIND LIST — never `features/organizations/peek/registry.ts`, which
 * statically imports all 19 peek components (THE FRAGMENTATION LAW).
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 *   route → `hrefFor` in `features/scopes/registry/entityRegistry.ts`
 *   peek  → `features/organizations/peek/registry.ts` + `kinds-list.ts` for a
 *           BESPOKE preview. Every registered entity with a readable title
 *           column already gets the generic `RegistryPeek` for free, so a new
 *           entity is previewable the moment it is registered — write a bespoke
 *           one only when the kind deserves more than title/description/dates.
 */

import type { LucideIcon } from "lucide-react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { hasPeek } from "@/features/organizations/peek/kinds-list";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * True when a value is a real uuid — the guard a surface needs BEFORE handing an
 * id to `EntityRef` / `EntityDoorControls`.
 *
 * Door resolution deliberately does not validate ids (a token's `hrefFor` is
 * free to use slugs), so any surface that DERIVES an id — parsing it out of a
 * surface key, reading an untyped column — must check first, or it mints a link
 * to `/agents/<junk>`: a door that opens on nothing, which the doctrine ranks
 * worse than no door at all.
 *
 * It lives here, beside `resolveEntityDoors`, because this module is the one
 * component-free entry point on the door path. It used to live only inside
 * `MatrxUuidCell`, which meant guarding an id dragged a table cell (and its
 * tooltip/toast/peek-host graph) into whatever chunk needed the check —
 * THE FRAGMENTATION LAW, paid for a three-line regex. Every importer was moved
 * to this module in the same change — there is deliberately no re-export left
 * behind in `MatrxUuidCell`, because that tripped `no-barrel-files` and the
 * rule is right.
 */
export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Entity tokens whose peek is registered under a different catalogue key.
 * Keep this at zero entries wherever possible — the real fix is aligning the
 * peek registry key with the canonical token.
 */
const PEEK_KEY_BY_TOKEN: Record<string, string> = {
  app: "agent_app",
  structured_list: "picklist",
};

/**
 * True when `RegistryPeek` can preview this entity even though no bespoke peek
 * is registered — it reads the registry's own schema/table/title column, so it
 * needs a title column and a table the BROWSER can actually read.
 *
 * `listCandidates` is the marker for the exception: a token only carries one
 * because its schema isn't PostgREST-exposed (`data_store` → `rag`), and
 * offering a preview button that always fails is its own dead end.
 */
function hasRegistryPeek(
  info: ReturnType<typeof tryGetEntityInfo>,
): boolean {
  return Boolean(info?.titleColumn) && !info?.listCandidates;
}

export interface EntityDoors {
  /** Canonical route to the record, or null when the token has no `hrefFor`. */
  href: string | null;
  /** True when a peek is registered for this token. */
  canPeek: boolean;
  /** Catalogue key to hand `<ResourcePeekHost kind=…>`. */
  peekKind: string;
  /** Registry icon for the entity type, when one is registered. */
  Icon: LucideIcon | null;
  /** Singular display label ("Agent", "Note"), or null for unknown tokens. */
  label: string | null;
}

/**
 * Resolve every door we can open for one record.
 *
 * `hrefOverride` wins over the registry route — for records that live in two
 * shells (a system agent under `/administration/…` vs a personal one under
 * `/agents/…`). It is honoured EXACTLY: an explicit `null` means "this
 * particular record has no door" and must not fall through to the registry,
 * which would send the user somewhere the caller deliberately ruled out. Only
 * `undefined` (no opinion) defers.
 *
 * Unknown tokens degrade to "no doors", never throw: a surface passing a token
 * we don't register yet must still render its text.
 */
export function resolveEntityDoors(
  token: string,
  id: string,
  hrefOverride?: string | null,
): EntityDoors {
  const info = tryGetEntityInfo(token);
  const peekKind = PEEK_KEY_BY_TOKEN[token] ?? token;
  return {
    href:
      hrefOverride !== undefined
        ? hrefOverride
        : (info?.hrefFor?.(id) ?? null),
    canPeek: hasPeek(peekKind) || hasRegistryPeek(info),
    peekKind,
    Icon: info?.Icon ?? null,
    label: info?.label ?? null,
  };
}

/**
 * Resolve an FK COLUMN NAME to a canonical entity token — `agent_id` → `agent`,
 * `task_id` → `task`. Deliberately strict: exact `<token>_id` only, and only
 * for tokens that actually have a door. Anything else returns null rather than
 * guessing, because a wrong link is worse than no link (a `<token>_id` that
 * points somewhere else would send the user to another record entirely).
 *
 * Used by generic surfaces that render a row's raw columns (the data-table row
 * inspector) and therefore can't be told each column's target by hand.
 */
export function tokenFromColumnName(column: string): string | null {
  const name = column.trim().toLowerCase();
  if (!name.endsWith("_id")) return null;
  const token = name.slice(0, -3);
  if (!token) return null;
  return hasAnyDoor(token) ? token : null;
}

/**
 * True when the platform can open this token at all (route or peek).
 * Use it to decide whether a bare id is worth rendering as a door — never to
 * decide whether to render the record at all.
 */
export function hasAnyDoor(token: string): boolean {
  const info = tryGetEntityInfo(token);
  return (
    Boolean(info?.hrefFor) ||
    hasPeek(PEEK_KEY_BY_TOKEN[token] ?? token) ||
    hasRegistryPeek(info)
  );
}

// ── Ids inside SENTENCES ─────────────────────────────────────────────────────
//
// 🚨 THE DEFECT THIS CLOSES: our servers write refusals for people —
// "resolved system agent 8f0bbfc2-… breaks the mandate contract" — and every
// screen printed them as flat text. The sentence NAMES a record that has an
// identity in our system, so THE DOOR LAW applies to it exactly as it does to
// a table cell: the person reading the refusal must be able to open the agent
// it is accusing, without hand-copying a uuid into a URL bar.
//
// A server sentence is verbatim by policy (`ServerNotes`, `RunFailureCard`),
// so nothing here rewrites, shortens or re-orders a word — the only change is
// that the ids inside it become reachable.

/**
 * Everyday nouns that name a registered entity by a different word than its
 * canonical token. Only add an entry you have VERIFIED points at the same
 * record type — a wrong door is worse than no door.
 */
const NOUN_ALIASES: Record<string, string> = {
  org: "organization",
  organisation: "organization",
  bot: "agent",
  workflow_definition: "workflow",
  // scheduler.sch_task — the scheduler's own sentences say "scheduled task".
  schedule: "sch_task",
  scheduled_task: "sch_task",
};

/** A word as it appears in prose → a candidate entity token. */
function nounToToken(word: string): string {
  const bare = word.toLowerCase().replace(/[^a-z0-9_]/g, "");
  // "agents" / "mandates" — prose pluralises, tokens don't.
  const singular =
    bare.length > 3 && bare.endsWith("s") && !bare.endsWith("ss")
      ? bare.slice(0, -1)
      : bare;
  return NOUN_ALIASES[singular] ?? singular;
}

/**
 * The entity token a sentence was talking about right before it printed an id.
 *
 * Deliberately conservative — it reads at most the four words in front of the
 * id, nearest first, and accepts only a word that resolves to a token the
 * platform can actually OPEN (`hasAnyDoor`). Anything else returns null and
 * the caller prints the id as it always did. Guessing here would mint links to
 * `/agents/<a workflow id>`: a door onto the wrong record, which reads as a
 * fact and is a lie.
 */
export function tokenFromPrecedingWords(preceding: string): string | null {
  const words = preceding.trim().split(/\s+/).filter(Boolean).slice(-4);
  // The compound ending at the id first, longest first ("scheduled task" →
  // `sch_task`, "agent version" → `agent_version`). A bare noun that is ALSO a
  // token must not win over the compound it closes: "scheduled task <id>"
  // resolved to `task` and minted a door onto /tasks/<a schedule id> — the
  // wrong record, which reads as a fact and is a lie (2026-09-11).
  for (let len = words.length; len >= 2; len--) {
    const joined = words.slice(-len).map(nounToToken).filter(Boolean).join("_");
    const phrase = NOUN_ALIASES[joined] ?? joined;
    if (phrase && hasAnyDoor(phrase)) return phrase;
  }
  // Then the nearest single noun that opens.
  for (let i = words.length - 1; i >= 0; i--) {
    const single = nounToToken(words[i]);
    if (single && hasAnyDoor(single)) return single;
  }
  return null;
}

/**
 * One piece of a sentence: plain prose, an id we can open a door on, or a run
 * the author marked as CODE with markdown backticks.
 */
export type SentenceSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ref"; id: string; token: string };

const UUID_IN_TEXT_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/**
 * INLINE CODE, THE WAY ITS AUTHOR WROTE IT.
 *
 * 🚨 THE DEFECT (V-PARITY/UX R-O2, both walk rounds). Sentences that name a
 * field, a key or a variable mark it the one way every author on this platform
 * marks it — markdown backticks:
 *
 *     Its structured output is missing `title`, `slides` — whatever reads this
 *     job's result requires them.
 *
 * Printed through a plain `<span>` the backtick CHARACTERS land on a subject
 * matter expert's screen. There is no second renderer for this: every sentence
 * somebody else wrote already reaches a person through `TextWithDoors`, so the
 * marks are understood HERE, beside the ids, and every one of its ~10 adopting
 * surfaces is fixed by the same three lines.
 *
 * Deliberately ONLY single-backtick spans, and never across a newline: this is
 * a sentence renderer, not a markdown engine. Anything else — an unmatched
 * backtick, a fenced block — stays exactly as it was typed.
 */
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/**
 * Split a server-authored sentence into prose, inline code and openable ids.
 *
 * `defaultToken` is what the CALL SITE knows that the sentence does not — a
 * mandate-resolution refusal is always about an agent, so its screen may say
 * so. It is used only when the prose itself names nothing openable.
 *
 * Every character of the input survives into the output in order — apart from
 * the two backticks delimiting an inline-code run, which are MARKUP the author
 * wrote to say "this is code" and were never words meant to be read. A caller
 * that joins the segments back together gets the server's words unchanged.
 */
export function segmentSentenceIds(
  text: string,
  defaultToken?: string | null,
): SentenceSegment[] {
  const out: SentenceSegment[] = [];
  let prose = 0;
  INLINE_CODE_RE.lastIndex = 0;
  for (
    let match = INLINE_CODE_RE.exec(text);
    match !== null;
    match = INLINE_CODE_RE.exec(text)
  ) {
    if (match.index > prose) {
      out.push(...segmentIdsOnly(text.slice(prose, match.index), defaultToken));
    }
    out.push({ kind: "code", text: match[1] });
    prose = match.index + match[0].length;
  }
  if (out.length === 0) return segmentIdsOnly(text, defaultToken);
  if (prose < text.length) {
    out.push(...segmentIdsOnly(text.slice(prose), defaultToken));
  }
  return out;
}

/** The id half, run over one run of prose that carries no code marks. */
function segmentIdsOnly(
  text: string,
  defaultToken?: string | null,
): SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  let cursor = 0;
  UUID_IN_TEXT_RE.lastIndex = 0;
  for (
    let match = UUID_IN_TEXT_RE.exec(text);
    match !== null;
    match = UUID_IN_TEXT_RE.exec(text)
  ) {
    const id = match[0];
    const start = match.index;
    const token =
      tokenFromPrecedingWords(text.slice(cursor, start)) ??
      (defaultToken && hasAnyDoor(defaultToken) ? defaultToken : null);
    if (token === null) continue; // No door we trust — leave it in the prose.
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "ref", id, token });
    cursor = start + id.length;
  }
  if (segments.length === 0) return [{ kind: "text", text }];
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
