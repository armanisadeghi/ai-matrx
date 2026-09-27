// features/flashcards/components/home/deckAgentWrites.ts
//
// Validation for the agent write targets on the Flashcards home
// (`matrx-user/education-flashcards`): `create_decks`, `update_decks` and
// `delete_decks` create, change and archive a list of the person's own decks.
// Pure — no React, no store — so the rules are testable and every target
// shares one reading of a deck object.
//
// Every problem is a sentence the agent can act on; a value that is partly
// wrong is refused whole, and the refusal lists EVERY problem at once
// (`collectProblems`).

import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

export const DECK_WRITE_KEYS = [
  "name",
  "description",
  "topic",
  "lesson",
  "difficulty",
] as const;

export const DECK_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type DeckDifficulty = (typeof DECK_DIFFICULTIES)[number];

/** The most decks one write may touch. */
export const MAX_DECKS_PER_WRITE = 25;

/** A deck object as an agent sends it, parsed. Absent key = not given; null = clear. */
export interface DeckWriteFields {
  name?: string;
  description?: string | null;
  topic?: string | null;
  lesson?: string | null;
  difficulty?: DeckDifficulty | null;
}

/** What the parsers need to know about one of the person's decks. */
export interface CurrentDeck {
  id: string;
  name: string;
  archived: boolean;
}

export interface DeckUpdatePlan {
  id: string;
  previousName: string;
  patch: DeckWriteFields;
  /** true = archive, false = restore, undefined = leave as is. */
  archived?: boolean;
  changed: string[];
}

const nameKey = (name: string) => name.trim().toLowerCase();

function rawField(entry: unknown, key: string): unknown {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as Record<string, unknown>)[key]
    : undefined;
}

function rawName(entry: unknown): string | undefined {
  const n = rawField(entry, "name");
  return typeof n === "string" ? n : undefined;
}

/**
 * Read one deck object. `where` names it in errors ("create_decks[2]").
 * Reports every bad field at once. "" clears an optional text field.
 */
export function parseDeckWriteFields(
  where: string,
  value: unknown,
  extraKeys: readonly string[] = [],
): DeckWriteFields {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `${where} must be an object with keys ${DECK_WRITE_KEYS.join(", ")}; received ${
        Array.isArray(value) ? "an array" : JSON.stringify(value)
      }.`,
    );
  const record = value as Record<string, unknown>;
  const problems = new ProblemList(where);
  const allowed = [...DECK_WRITE_KEYS, ...extraKeys];
  const unknownKeys = Object.keys(record).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0)
    problems.add(
      `${where} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${allowed.join(", ")}.`,
    );

  const fields: DeckWriteFields = {};
  if ("name" in record && record.name !== undefined) {
    if (typeof record.name !== "string" || !record.name.trim())
      problems.add(`${where}.name must be non-empty text.`);
    else fields.name = record.name.trim();
  }
  for (const key of ["description", "topic", "lesson"] as const) {
    if (!(key in record) || record[key] === undefined) continue;
    const raw = record[key];
    if (raw === null) fields[key] = null;
    else if (typeof raw !== "string")
      problems.add(`${where}.${key} must be plain text; received ${JSON.stringify(raw)}.`);
    else fields[key] = raw.trim() || null;
  }
  if ("difficulty" in record && record.difficulty !== undefined) {
    const raw = record.difficulty;
    if (raw === null || raw === "") fields.difficulty = null;
    else {
      const d = String(raw).trim().toLowerCase();
      if (!(DECK_DIFFICULTIES as readonly string[]).includes(d))
        problems.add(
          `${where}.difficulty must be one of ${DECK_DIFFICULTIES.join(", ")} (or null to clear); received ${JSON.stringify(raw)}.`,
        );
      else fields.difficulty = d as DeckDifficulty;
    }
  }
  problems.throwIfAny();
  return fields;
}

export function parseCreateDecksValue(
  value: unknown,
  existing: readonly CurrentDeck[],
): (DeckWriteFields & { name: string })[] {
  const list = readCollectionList("create_decks", "decks", value, MAX_DECKS_PER_WRITE);
  const taken = new Set(existing.filter((d) => !d.archived).map((d) => nameKey(d.name)));
  return collectProblems(
    "create_decks",
    list,
    (entry, i) => {
      const where = `create_decks[${i}]`;
      const fields = parseDeckWriteFields(where, entry);
      if (!fields.name) throw new Error(`${where}.name is required.`);
      return { ...fields, name: fields.name };
    },
    {
      nameOf: rawName,
      listChecks: (items) => {
        const clashes = items.filter((it) => !!it.name && taken.has(nameKey(it.name)));
        return [
          repeatsProblem("create_decks", items.map((it) => it.name), "deck name"),
          clashes.length > 0 &&
            `The person already has a deck named ${clashes
              .map((c) => `"${c.name}" (create_decks[${c.index}])`)
              .join(", ")}. Use a different name, or update the existing deck with update_decks.`,
        ];
      },
    },
  );
}

function findDeck(where: string, id: unknown, decks: readonly CurrentDeck[]): CurrentDeck {
  if (typeof id !== "string" || !id.trim())
    throw new ListLevelProblem(`${where}.id is required (a deck id from my_decks).`);
  const deck = decks.find((d) => d.id === id.trim());
  if (!deck)
    throw new ListLevelProblem(
      `${where}.id "${id}" is not one of the person's own decks (my_decks). Decks other people shared can be studied but not changed here.`,
    );
  return deck;
}

export function parseUpdateDecksValue(
  value: unknown,
  decks: readonly CurrentDeck[],
): DeckUpdatePlan[] {
  const list = readCollectionList("update_decks", "decks", value, MAX_DECKS_PER_WRITE);
  const plans = collectProblems(
    "update_decks",
    list,
    (entry, i): DeckUpdatePlan => {
      const where = `update_decks[${i}]`;
      const id = rawField(entry, "id");
      const archived = rawField(entry, "archived");
      const deck = findDeck(where, id, decks);
      const problems = new ProblemList(where);
      if (archived !== undefined && typeof archived !== "boolean")
        problems.add(
          `${where}.archived must be true (archive) or false (restore); received ${JSON.stringify(archived)}.`,
        );
      const rest = { ...(entry as Record<string, unknown>) };
      delete rest.id;
      delete rest.archived;
      const patch = problems.check(() => parseDeckWriteFields(where, rest)) ?? {};
      const changed = [
        ...Object.keys(patch),
        ...(typeof archived === "boolean" ? ["archived"] : []),
      ];
      // "Changes nothing" only when nothing was sent — a field that failed its
      // own check has already said why, and repeating it as "nothing" reads
      // like a harmless no-op instead of a refusal.
      if (changed.length === 0 && Object.keys(rest).length === 0 && archived === undefined)
        problems.add(
          `${where} changes nothing: send at least one of ${[...DECK_WRITE_KEYS, "archived"].join(", ")} with the id.`,
        );
      if (deck.archived && archived !== false && Object.keys(patch).length > 0)
        problems.add(
          `${where} edits an archived deck; send "archived": false in the same item to restore it first.`,
        );
      problems.throwIfAny();
      return {
        id: deck.id,
        previousName: deck.name,
        patch,
        archived: typeof archived === "boolean" ? archived : undefined,
        changed,
      };
    },
    {
      nameOf: (entry) => {
        const id = rawField(entry, "id");
        return decks.find((d) => d.id === id)?.name;
      },
      listChecks: (items) => {
        const ids = items.map((it) => {
          const id = rawField(it.raw, "id");
          return typeof id === "string" ? id : null;
        });
        // A rename onto another live deck's name (or two renames onto one).
        const renames = items
          .filter((it) => it.ok && it.value?.patch.name)
          .map((it) => ({ index: it.index, id: it.value!.id, name: it.value!.patch.name! }));
        const clashes = renames.filter((r) =>
          decks.some((d) => !d.archived && d.id !== r.id && nameKey(d.name) === nameKey(r.name)),
        );
        return [
          repeatsProblem("update_decks", ids, "deck id", "Send one item per deck."),
          repeatsProblem("update_decks", renames.map((r) => r.name), "new deck name"),
          clashes.length > 0 &&
            `Another of the person's decks is already named ${clashes
              .map((c) => `"${c.name}" (update_decks[${c.index}])`)
              .join(", ")}. Pick a different name.`,
        ];
      },
    },
  );
  return plans;
}

export function parseDeleteDecksValue(
  value: unknown,
  decks: readonly CurrentDeck[],
): CurrentDeck[] {
  const list = readCollectionList("delete_decks", "decks", value, MAX_DECKS_PER_WRITE);
  return collectProblems(
    "delete_decks",
    list,
    (entry, i) => {
      const where = `delete_decks[${i}]`;
      const id = typeof entry === "string" ? entry : rawField(entry, "id");
      const deck = findDeck(where, id, decks);
      if (deck.archived)
        throw new Error(`${where} "${deck.name}" is already archived; nothing to do.`);
      return deck;
    },
    {
      nameOf: (entry) => {
        const id = typeof entry === "string" ? entry : rawField(entry, "id");
        return decks.find((d) => d.id === id)?.name;
      },
      listChecks: (items) => [
        repeatsProblem(
          "delete_decks",
          items.map((it) => {
            const id = typeof it.raw === "string" ? it.raw : rawField(it.raw, "id");
            return typeof id === "string" ? id : null;
          }),
          "deck id",
        ),
      ],
    },
  );
}
