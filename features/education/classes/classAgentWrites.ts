// features/education/classes/classAgentWrites.ts
//
// Validation for the agent write targets on My Classes
// (`matrx-user/education-classes`): `new_class_draft` fills the New class
// dialog; `create_classes`, `update_classes` and `delete_classes` create,
// change and delete a list of classes. Pure — no React, no store — so the
// rules are testable and every target shares one reading of a class object.
//
// Every problem is a sentence the agent can act on; a value that is partly
// wrong is refused whole, never partly applied, and the refusal lists EVERY
// problem at once (owner ruling 2026-09-27) via `collectProblems`.

import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import { DEFAULT_ACCESS_MODE } from "./constants";
import type { CreateClassInput } from "./hooks/useClasses";
import type {
  AccessMode,
  ClassExamDate,
  ClassSettings,
  StudyClass,
} from "./types";

export const CLASS_WRITE_KEYS = [
  "name",
  "description",
  "teacher",
  "term",
  "period",
  "access_mode",
  "price",
  "exam_dates",
] as const;

const ACCESS_MODES: readonly AccessMode[] = ["open", "closed", "paid"];

/** The most classes one `create_classes` write may create. */
export const MAX_CLASSES_PER_WRITE = 25;

/** A class object as an agent sends it, parsed. Absent key = not given. */
export interface ClassWriteFields {
  name?: string;
  description?: string;
  teacher?: string;
  term?: string;
  period?: string;
  accessMode?: AccessMode;
  /** US dollars. */
  price?: number;
  examDates?: ClassExamDate[];
}

export function makeExamId(): string {
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function text(where: string, key: string, raw: unknown): string {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string")
    throw new Error(
      `${where}.${key} must be plain text; received ${JSON.stringify(raw)}.`,
    );
  return raw.trim();
}

/**
 * Read one class object. `where` names it in errors ("create_classes[2]").
 * Checks shape and each field, reporting EVERY bad field at once; the
 * cross-field rules for a CREATE live in `toCreateClassInput`.
 */
export function parseClassWriteFields(
  where: string,
  value: unknown,
): ClassWriteFields {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `${where} must be an object with keys ${CLASS_WRITE_KEYS.join(", ")}; received ${
        Array.isArray(value) ? "an array" : JSON.stringify(value)
      }.`,
    );
  const record = value as Record<string, unknown>;
  const problems = new ProblemList(where);
  const unknownKeys = Object.keys(record).filter(
    (k) => !(CLASS_WRITE_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0)
    problems.add(
      `${where} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${CLASS_WRITE_KEYS.join(", ")}.`,
    );

  const fields: ClassWriteFields = {};
  for (const key of ["name", "description", "teacher", "term", "period"] as const) {
    if (key in record && record[key] != null) {
      const read = problems.check(() => text(where, key, record[key]));
      if (read !== undefined) fields[key] = read;
    }
  }
  if ("name" in fields && !fields.name)
    problems.add(`${where}.name cannot be empty.`);

  if ("access_mode" in record && record.access_mode != null) {
    const mode = String(record.access_mode).trim().toLowerCase();
    if (!ACCESS_MODES.includes(mode as AccessMode))
      problems.add(
        `${where}.access_mode must be one of ${ACCESS_MODES.join(", ")}; received ${JSON.stringify(record.access_mode)}.`,
      );
    else fields.accessMode = mode as AccessMode;
  }

  if ("price" in record && record.price != null) {
    const price =
      typeof record.price === "string"
        ? Number(record.price.replace(/^\$/, ""))
        : record.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 1)
      problems.add(
        `${where}.price must be a number of US dollars, at least 1; received ${JSON.stringify(record.price)}.`,
      );
    else fields.price = Math.round(price * 100) / 100;
  }

  if ("exam_dates" in record && record.exam_dates != null) {
    if (!Array.isArray(record.exam_dates))
      problems.add(`${where}.exam_dates must be an array of { title, date }.`);
    else {
      const exams: ClassExamDate[] = [];
      record.exam_dates.forEach((raw, i) => {
        const at = `${where}.exam_dates[${i}]`;
        if (raw === null || typeof raw !== "object" || Array.isArray(raw))
          return problems.add(`${at} must be an object { title, date }.`);
        const exam = raw as Record<string, unknown>;
        const title = typeof exam.title === "string" ? exam.title.trim() : "";
        if (!title) problems.add(`${at}.title is required, e.g. "Midterm".`);
        const date = typeof exam.date === "string" ? exam.date.trim() : "";
        if (!isIsoDate(date))
          problems.add(
            `${at}.date must be a real date as YYYY-MM-DD; received ${JSON.stringify(exam.date)}.`,
          );
        if (title && isIsoDate(date)) exams.push({ id: makeExamId(), title, date });
      });
      fields.examDates = exams;
    }
  }

  problems.throwIfAny();
  return fields;
}

/** Read the `new_class_draft` value: any class fields, at least one. */
export function parseNewClassDraftValue(value: unknown): ClassWriteFields {
  const fields = parseClassWriteFields("new_class_draft", value);
  if (Object.keys(fields).length === 0)
    throw new Error(
      'new_class_draft needs at least one field, e.g. { "name": "AP Biology" }.',
    );
  return fields;
}

/** The cross-field rules a class must meet to be CREATED (every one reported). */
export function toCreateClassInput(
  where: string,
  fields: ClassWriteFields,
): CreateClassInput {
  const problems = new ProblemList(where);
  if (!fields.name) problems.add(`${where}.name is required.`);
  const accessMode = fields.accessMode ?? DEFAULT_ACCESS_MODE;
  if (accessMode === "paid" && fields.price == null)
    problems.add(
      `${where} is a paid class, so it needs price (US dollars, at least 1).`,
    );
  if (accessMode !== "paid" && fields.price != null)
    problems.add(
      `${where} has a price but access_mode is "${accessMode}"; only a "paid" class takes a price.`,
    );
  problems.throwIfAny();
  return {
    name: fields.name!,
    description: fields.description ?? "",
    settings: {
      examDates: fields.examDates ?? [],
      teacher: fields.teacher || undefined,
      term: fields.term || undefined,
      period: fields.period || undefined,
      accessMode,
      priceCents:
        accessMode === "paid" && fields.price != null
          ? Math.round(fields.price * 100)
          : undefined,
    },
  };
}

/** The name a raw class entry carries, if any (labels problems, finds repeats). */
function rawName(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const name = (raw as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

/**
 * Read the whole `create_classes` value. Refuses the list — before anything is
 * created — reporting EVERY problem at once: each bad entry, then a name
 * repeated within the list and names the person already has (so a retried
 * write never makes duplicates).
 */
export function parseCreateClassesValue(
  value: unknown,
  existingNames: readonly string[],
): CreateClassInput[] {
  const list = unwrapList(value, "classes");
  if (!Array.isArray(list))
    throw new Error(
      "create_classes expects an ARRAY of class objects, e.g. [{ \"name\": \"AP Biology\" }]; for a single class send a list of one.",
    );
  if (list.length === 0)
    throw new Error("create_classes needs at least one class.");
  if (list.length > MAX_CLASSES_PER_WRITE)
    throw new Error(
      `create_classes takes at most ${MAX_CLASSES_PER_WRITE} classes per write; received ${list.length}. Split the list.`,
    );

  const existing = new Set(existingNames.map(nameKey));
  return collectProblems(
    "create_classes",
    list,
    (entry, i) =>
      toCreateClassInput(
        `create_classes[${i}]`,
        parseClassWriteFields(`create_classes[${i}]`, entry),
      ),
    {
      nameOf: rawName,
      listChecks: (items) => {
        const names = items.map((item) => item.name);
        const clashes = items.filter(
          (item) => !!item.name && existing.has(nameKey(item.name)),
        );
        return [
          repeatsProblem("create_classes", names, "class name"),
          clashes.length > 0 &&
            `The person already has ${clashes
              .map((c) => `"${c.name}" (create_classes[${c.index}])`)
              .join(", ")}. Remove ${
              clashes.length === 1 ? "it" : "them"
            } from the list (or rename) and try again.`,
        ];
      },
    },
  );
}

// ─── update_classes / delete_classes ─────────────────────────────────────────

/** What the update and delete parsers need to know about a current class. */
export type CurrentClass = Pick<
  StudyClass,
  "id" | "slug" | "name" | "description" | "settings"
>;

export const CLASS_UPDATE_KEYS = ["id", ...CLASS_WRITE_KEYS, "archived"] as const;

/** One validated update, ready for `useClasses().updateClass`. */
export interface ClassUpdatePlan {
  id: string;
  /** The class's name BEFORE this update (for outcome messages). */
  previousName: string;
  patch: { name?: string; description?: string; settings: ClassSettings };
  /** True when access_mode changes — the caller also calls setAccessMode. */
  accessModeChanged: boolean;
  /** The agent-facing keys this update changes, e.g. ["description", "exam_dates"]. */
  changed: string[];
}

const nameKey = (name: string) => name.trim().toLowerCase();

/** Accept a bare array, or `{ [wrapperKey]: [...] }`. */
function unwrapList(value: unknown, wrapperKey: string): unknown {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as Record<string, unknown>)[wrapperKey])
    ? (value as Record<string, unknown[]>)[wrapperKey]
    : value;
}

function checkListSize(target: string, list: unknown[]): void {
  if (list.length === 0) throw new Error(`${target} needs at least one class.`);
  if (list.length > MAX_CLASSES_PER_WRITE)
    throw new Error(
      `${target} takes at most ${MAX_CLASSES_PER_WRITE} classes per write; received ${list.length}. Split the list.`,
    );
}

/** The id a raw entry names: the entry itself, or its `id`. */
function rawId(entry: unknown): unknown {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as { id?: unknown }).id
    : entry;
}

/** A raw entry's id when it is text, trimmed (for repeats and labels). */
function rawIdText(entry: unknown): string | undefined {
  const id = rawId(entry);
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * The current class an entry names. A missing id is the entry's own problem;
 * an unknown id is reported with the list-level problems.
 */
function findClass(
  where: string,
  id: unknown,
  current: readonly CurrentClass[],
): CurrentClass {
  if (typeof id !== "string" || !id.trim())
    throw new Error(
      `${where}.id is required: the class's id from owned_classes or archived_classes.`,
    );
  const found = current.find((c) => c.id === id.trim());
  if (!found)
    throw new ListLevelProblem(
      `${where}.id "${id}" is not one of the person's classes. Use an id from owned_classes or archived_classes.`,
    );
  return found;
}

/**
 * Read the whole `update_classes` value against the person's CURRENT classes
 * (active and archived). Each entry changes only the fields it sends, merged
 * onto the class's current settings (update_scope replaces the whole settings
 * JSON). Refuses the whole list — before anything is written — reporting
 * EVERY problem at once: bad fields, a paid class with no price, a price on a
 * class that is not paid, then an unknown or repeated id and a rename onto a
 * name another class keeps.
 */
export function parseUpdateClassesValue(
  value: unknown,
  currentClasses: readonly CurrentClass[],
): ClassUpdatePlan[] {
  const list = unwrapList(value, "classes");
  if (!Array.isArray(list))
    throw new Error(
      'update_classes expects an ARRAY of objects, each with the class id, e.g. [{ "id": "…", "description": "…" }]; for one class send a list of one.',
    );
  checkListSize("update_classes", list);

  const byId = (entry: unknown) => {
    const id = rawIdText(entry);
    return id ? currentClasses.find((c) => c.id === id) : undefined;
  };

  return collectProblems(
    "update_classes",
    list,
    (entry, i): ClassUpdatePlan => {
      const where = `update_classes[${i}]`;
      if (entry === null || typeof entry !== "object" || Array.isArray(entry))
        throw new Error(
          `${where} must be an object with id and the fields to change (${CLASS_UPDATE_KEYS.join(", ")}).`,
        );
      const { id, archived, ...rest } = entry as Record<string, unknown>;
      const problems = new ProblemList(where);
      let cls: CurrentClass;
      try {
        cls = findClass(where, id, currentClasses);
      } catch (error) {
        // Still report the entry's own bad fields beside the unknown id.
        problems.check(() => parseClassWriteFields(where, rest));
        if (problems.ok) throw error;
        problems.add((error as Error).message);
        problems.throwIfAny();
        throw error;
      }
      if (archived !== undefined && archived !== null && typeof archived !== "boolean")
        problems.add(
          `${where}.archived must be true (archive) or false (restore); received ${JSON.stringify(archived)}.`,
        );

      const fields = problems.check(() => parseClassWriteFields(where, rest));
      const changed = [
        ...Object.keys(rest).filter((k) => rest[k] != null),
        ...(typeof archived === "boolean" ? ["archived"] : []),
      ];
      if (changed.length === 0)
        problems.add(
          `${where} changes nothing: send at least one of ${CLASS_UPDATE_KEYS.filter((k) => k !== "id").join(", ")} with the id.`,
        );
      if (!fields) {
        problems.throwIfAny();
        throw new Error(`${where} could not be read.`);
      }

      const current = cls.settings;
      const accessMode = fields.accessMode ?? current.accessMode;
      if (accessMode !== "paid" && fields.price != null)
        problems.add(
          `${where} sets a price but the class's access_mode ${
            fields.accessMode ? "would be" : "is"
          } "${accessMode}"; only a "paid" class takes a price.`,
        );
      const priceCents =
        accessMode !== "paid"
          ? undefined
          : fields.price != null
            ? Math.round(fields.price * 100)
            : current.priceCents;
      if (accessMode === "paid" && !priceCents)
        problems.add(
          `${where} makes "${cls.name}" a paid class, but it has no price. Send price (US dollars, at least 1) too.`,
        );
      problems.throwIfAny();

      const settings: ClassSettings = {
        ...current,
        examDates: fields.examDates ?? current.examDates,
        teacher: fields.teacher !== undefined ? fields.teacher || undefined : current.teacher,
        term: fields.term !== undefined ? fields.term || undefined : current.term,
        period: fields.period !== undefined ? fields.period || undefined : current.period,
        archived: typeof archived === "boolean" ? archived : current.archived,
        accessMode,
        priceCents,
      };

      return {
        id: cls.id,
        previousName: cls.name,
        patch: {
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(fields.description !== undefined
            ? { description: fields.description }
            : {}),
          settings,
        },
        accessModeChanged: accessMode !== current.accessMode,
        changed,
      };
    },
    {
      nameOf: (entry) => byId(entry)?.name,
      listChecks: (items) => {
        const out: (string | undefined)[] = [
          repeatsProblem(
            "update_classes",
            items.map((item) => rawIdText(item.raw)),
            "class id",
            "Merge the changes into one entry.",
          ),
        ];
        // Names after every update in the list must stay unique (a swap is fine).
        const plans = items.filter((item) => item.ok).map((item) => item.value!);
        const finalName = new Map(currentClasses.map((c) => [c.id, c.name]));
        for (const plan of plans)
          if (plan.patch.name !== undefined) finalName.set(plan.id, plan.patch.name);
        for (const plan of plans) {
          if (plan.patch.name === undefined) continue;
          const clash = [...finalName.entries()].find(
            ([otherId, name]) =>
              otherId !== plan.id && nameKey(name) === nameKey(plan.patch.name!),
          );
          if (clash)
            out.push(
              `update_classes would rename "${plan.previousName}" to "${plan.patch.name}", but another class (${clash[0]}) is named "${clash[1]}". Pick a different name.`,
            );
        }
        return out;
      },
    },
  );
}

/**
 * Read the whole `delete_classes` value: an array of ids or of `{ id }`.
 * Refuses the whole list, reporting every unknown or repeated id at once.
 */
export function parseDeleteClassesValue(
  value: unknown,
  currentClasses: readonly CurrentClass[],
): CurrentClass[] {
  const list = unwrapList(unwrapList(value, "classes"), "ids");
  if (!Array.isArray(list))
    throw new Error(
      'delete_classes expects an ARRAY of class ids or of { "id": "…" } objects; for one class send a list of one.',
    );
  checkListSize("delete_classes", list);
  return collectProblems(
    "delete_classes",
    list,
    (entry, i) => findClass(`delete_classes[${i}]`, rawId(entry), currentClasses),
    {
      nameOf: (entry) => {
        const id = rawIdText(entry);
        return id ? currentClasses.find((c) => c.id === id)?.name : undefined;
      },
      listChecks: (items) => [
        repeatsProblem(
          "delete_classes",
          items.map((item) => rawIdText(item.raw)),
          "class id",
        ),
      ],
    },
  );
}
