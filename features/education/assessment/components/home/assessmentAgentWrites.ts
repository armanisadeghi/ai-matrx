// features/education/assessment/components/home/assessmentAgentWrites.ts
//
// Validation for the agent write targets on the quiz / practice-test list
// (`matrx-user/education-quizzes`, `matrx-user/education-practice-tests`):
// `create_<plural>`, `update_<plural>` and `delete_<plural>` (plural =
// "quizzes" | "practice_tests") create, change and archive the
// person's own assessments of the list's kind. Pure — no React, no store — so
// the rules are testable. Every problem is a sentence the agent can act on; a
// value that is partly wrong is refused whole, listing EVERY problem at once.
// Mirrors features/flashcards/components/home/deckAgentWrites.ts.

import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import { displayTitle } from "@/components/markdown-core/plain-title";
import { DEPTHS, type Depth } from "../../data/types";

export const ASSESSMENT_WRITE_KEYS = [
  "title",
  "description",
  "topic",
  "exam_type",
  "depth",
] as const;

/** The most assessments one write may touch. */
export const MAX_ASSESSMENTS_PER_WRITE = 25;
const TITLE_MAX = 200;
const EXAM_MAX = 100;

/** An assessment object as an agent sends it, parsed. Absent = not given; null = clear. */
export interface AssessmentWriteFields {
  title?: string;
  description?: string | null;
  topic?: string | null;
  exam_type?: string | null;
  depth?: Depth | null;
}

/** What the parsers need to know about one of the person's assessments. */
export interface CurrentAssessment {
  id: string;
  title: string;
  archived: boolean;
}

export interface AssessmentUpdatePlan {
  id: string;
  previousTitle: string;
  patch: AssessmentWriteFields;
  /** true = archive, false = restore, undefined = leave as is. */
  archived?: boolean;
  changed: string[];
}

const titleKey = (title: string) => title.trim().toLowerCase();

function rawField(entry: unknown, key: string): unknown {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as Record<string, unknown>)[key]
    : undefined;
}

function rawTitle(entry: unknown): string | undefined {
  const t = rawField(entry, "title");
  return typeof t === "string" ? t : undefined;
}

/** Read one assessment object. `where` names it in errors ("create_assessments[2]"). */
export function parseAssessmentWriteFields(
  where: string,
  value: unknown,
  extraKeys: readonly string[] = [],
): AssessmentWriteFields {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `${where} must be an object with keys ${ASSESSMENT_WRITE_KEYS.join(", ")}; received ${
        Array.isArray(value) ? "an array" : JSON.stringify(value)
      }.`,
    );
  const record = value as Record<string, unknown>;
  const problems = new ProblemList(where);
  const allowed = [...ASSESSMENT_WRITE_KEYS, ...extraKeys];
  const unknownKeys = Object.keys(record).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0)
    problems.add(
      `${where} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${allowed.join(", ")}.`,
    );

  const fields: AssessmentWriteFields = {};
  if ("title" in record && record.title !== undefined) {
    // A title is plain text: markdown syntax is projected away, the same rule
    // every title writer follows (components/markdown-core/plain-title.ts).
    const clean = typeof record.title === "string" ? displayTitle(record.title) : "";
    if (!clean) problems.add(`${where}.title must be non-empty text.`);
    else if (clean.length > TITLE_MAX)
      problems.add(`${where}.title must be at most ${TITLE_MAX} characters.`);
    else fields.title = clean;
  }
  for (const key of ["description", "topic", "exam_type"] as const) {
    if (!(key in record) || record[key] === undefined) continue;
    const raw = record[key];
    if (raw === null) fields[key] = null;
    else if (typeof raw !== "string")
      problems.add(`${where}.${key} must be plain text; received ${JSON.stringify(raw)}.`);
    else if (key === "exam_type" && raw.trim().length > EXAM_MAX)
      problems.add(`${where}.exam_type must be at most ${EXAM_MAX} characters.`);
    else fields[key] = (key === "topic" ? displayTitle(raw) : raw.trim()) || null;
  }
  if ("depth" in record && record.depth !== undefined) {
    const raw = record.depth;
    if (raw === null || raw === "") fields.depth = null;
    else {
      const d = String(raw).trim().toLowerCase();
      if (!(DEPTHS as readonly string[]).includes(d))
        problems.add(
          `${where}.depth must be one of ${DEPTHS.join(", ")} (or null to clear); received ${JSON.stringify(raw)}.`,
        );
      else fields.depth = d as Depth;
    }
  }
  problems.throwIfAny();
  return fields;
}

export function parseCreateAssessmentsValue(
  plural: string,
  value: unknown,
  existing: readonly CurrentAssessment[],
): (AssessmentWriteFields & { title: string })[] {
  const list = readCollectionList(
    `create_${plural}`,
    "assessments",
    value,
    MAX_ASSESSMENTS_PER_WRITE,
  );
  const taken = new Set(existing.filter((a) => !a.archived).map((a) => titleKey(a.title)));
  return collectProblems(
    `create_${plural}`,
    list,
    (entry, i) => {
      const where = `create_${plural}[${i}]`;
      const fields = parseAssessmentWriteFields(where, entry);
      if (!fields.title) throw new Error(`${where}.title is required.`);
      return { ...fields, title: fields.title };
    },
    {
      nameOf: rawTitle,
      listChecks: (items) => {
        const clashes = items.filter((it) => !!it.name && taken.has(titleKey(it.name)));
        return [
          repeatsProblem(`create_${plural}`, items.map((it) => it.name), "title"),
          clashes.length > 0 &&
            `The person already has one titled ${clashes
              .map((c) => `"${c.name}" (create_${plural}[${c.index}])`)
              .join(", ")}. Use a different title, or change the existing one with update_${plural}.`,
        ];
      },
    },
  );
}

function findAssessment(
  where: string,
  id: unknown,
  list: readonly CurrentAssessment[],
): CurrentAssessment {
  if (typeof id !== "string" || !id.trim())
    throw new ListLevelProblem(`${where}.id is required (an id from my_assessments).`);
  const found = list.find((a) => a.id === id.trim());
  if (!found)
    throw new ListLevelProblem(
      `${where}.id "${id}" is not one of the person's own assessments of this kind (my_assessments). Ones other people shared can be taken but not changed here.`,
    );
  return found;
}

export function parseUpdateAssessmentsValue(
  plural: string,
  value: unknown,
  current: readonly CurrentAssessment[],
): AssessmentUpdatePlan[] {
  const list = readCollectionList(
    `update_${plural}`,
    "assessments",
    value,
    MAX_ASSESSMENTS_PER_WRITE,
  );
  return collectProblems(
    `update_${plural}`,
    list,
    (entry, i): AssessmentUpdatePlan => {
      const where = `update_${plural}[${i}]`;
      const id = rawField(entry, "id");
      const archived = rawField(entry, "archived");
      const found = findAssessment(where, id, current);
      const problems = new ProblemList(where);
      if (archived !== undefined && typeof archived !== "boolean")
        problems.add(
          `${where}.archived must be true (archive) or false (restore); received ${JSON.stringify(archived)}.`,
        );
      const rest = { ...(entry as Record<string, unknown>) };
      delete rest.id;
      delete rest.archived;
      const patch = problems.check(() => parseAssessmentWriteFields(where, rest)) ?? {};
      const changed = [
        ...Object.keys(patch),
        ...(typeof archived === "boolean" ? ["archived"] : []),
      ];
      if (changed.length === 0)
        problems.add(
          `${where} changes nothing: send at least one of ${[...ASSESSMENT_WRITE_KEYS, "archived"].join(", ")} with the id.`,
        );
      if (found.archived && archived !== false && Object.keys(patch).length > 0)
        problems.add(
          `${where} edits an archived one; send "archived": false in the same item to restore it first.`,
        );
      problems.throwIfAny();
      return {
        id: found.id,
        previousTitle: found.title,
        patch,
        archived: typeof archived === "boolean" ? archived : undefined,
        changed,
      };
    },
    {
      nameOf: (entry) => {
        const id = rawField(entry, "id");
        return current.find((a) => a.id === id)?.title;
      },
      listChecks: (items) => {
        const ids = items.map((it) => {
          const id = rawField(it.raw, "id");
          return typeof id === "string" ? id : null;
        });
        const renames = items
          .filter((it) => it.ok && it.value?.patch.title)
          .map((it) => ({ index: it.index, id: it.value!.id, title: it.value!.patch.title! }));
        const clashes = renames.filter((r) =>
          current.some((a) => !a.archived && a.id !== r.id && titleKey(a.title) === titleKey(r.title)),
        );
        return [
          repeatsProblem(`update_${plural}`, ids, "id", "Send one item per assessment."),
          repeatsProblem(`update_${plural}`, renames.map((r) => r.title), "new title"),
          clashes.length > 0 &&
            `Another of the person's assessments is already titled ${clashes
              .map((c) => `"${c.title}" (update_${plural}[${c.index}])`)
              .join(", ")}. Pick a different title.`,
        ];
      },
    },
  );
}

export function parseDeleteAssessmentsValue(
  plural: string,
  value: unknown,
  current: readonly CurrentAssessment[],
): CurrentAssessment[] {
  const list = readCollectionList(
    `delete_${plural}`,
    "assessments",
    value,
    MAX_ASSESSMENTS_PER_WRITE,
  );
  const idOf = (entry: unknown) => (typeof entry === "string" ? entry : rawField(entry, "id"));
  return collectProblems(
    `delete_${plural}`,
    list,
    (entry, i) => {
      const where = `delete_${plural}[${i}]`;
      const found = findAssessment(where, idOf(entry), current);
      if (found.archived)
        throw new Error(`${where} "${found.title}" is already archived; nothing to do.`);
      return found;
    },
    {
      nameOf: (entry) => current.find((a) => a.id === idOf(entry))?.title,
      listChecks: (items) => [
        repeatsProblem(
          `delete_${plural}`,
          items.map((it) => {
            const id = idOf(it.raw);
            return typeof id === "string" ? id : null;
          }),
          "id",
        ),
      ],
    },
  );
}
