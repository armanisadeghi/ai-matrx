// features/education/classes/classAgentWrites.ts
//
// Validation for the two agent write targets on My Classes
// (`matrx-user/education-classes`): `new_class_draft` fills the New class
// dialog, `create_classes` creates a list. Pure — no React, no store — so the
// rules are testable and both targets share one reading of a class object.
//
// Every problem is thrown as a sentence the agent can act on; a value that is
// partly wrong is refused whole, never partly applied.

import { DEFAULT_ACCESS_MODE } from "./constants";
import type { CreateClassInput } from "./hooks/useClasses";
import type { AccessMode, ClassExamDate } from "./types";

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
 * Checks shape and each field; the cross-field rules for a CREATE live in
 * `toCreateClassInput`.
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
  const unknownKeys = Object.keys(record).filter(
    (k) => !(CLASS_WRITE_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0)
    throw new Error(
      `${where} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${CLASS_WRITE_KEYS.join(", ")}.`,
    );

  const fields: ClassWriteFields = {};
  for (const key of ["name", "description", "teacher", "term", "period"] as const) {
    if (key in record && record[key] != null)
      fields[key] = text(where, key, record[key]);
  }
  if ("name" in fields && !fields.name)
    throw new Error(`${where}.name cannot be empty.`);

  if ("access_mode" in record && record.access_mode != null) {
    const mode = String(record.access_mode).trim().toLowerCase();
    if (!ACCESS_MODES.includes(mode as AccessMode))
      throw new Error(
        `${where}.access_mode must be one of ${ACCESS_MODES.join(", ")}; received ${JSON.stringify(record.access_mode)}.`,
      );
    fields.accessMode = mode as AccessMode;
  }

  if ("price" in record && record.price != null) {
    const price =
      typeof record.price === "string"
        ? Number(record.price.replace(/^\$/, ""))
        : record.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 1)
      throw new Error(
        `${where}.price must be a number of US dollars, at least 1; received ${JSON.stringify(record.price)}.`,
      );
    fields.price = Math.round(price * 100) / 100;
  }

  if ("exam_dates" in record && record.exam_dates != null) {
    if (!Array.isArray(record.exam_dates))
      throw new Error(
        `${where}.exam_dates must be an array of { title, date }.`,
      );
    fields.examDates = record.exam_dates.map((raw, i) => {
      const at = `${where}.exam_dates[${i}]`;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(`${at} must be an object { title, date }.`);
      const exam = raw as Record<string, unknown>;
      const title = typeof exam.title === "string" ? exam.title.trim() : "";
      if (!title) throw new Error(`${at}.title is required, e.g. "Midterm".`);
      const date = typeof exam.date === "string" ? exam.date.trim() : "";
      if (!isIsoDate(date))
        throw new Error(
          `${at}.date must be a real date as YYYY-MM-DD; received ${JSON.stringify(exam.date)}.`,
        );
      return { id: makeExamId(), title, date };
    });
  }

  return fields;
}

/** The cross-field rules a class must meet to be CREATED. */
export function toCreateClassInput(
  where: string,
  fields: ClassWriteFields,
): CreateClassInput {
  if (!fields.name) throw new Error(`${where}.name is required.`);
  const accessMode = fields.accessMode ?? DEFAULT_ACCESS_MODE;
  if (accessMode === "paid" && fields.price == null)
    throw new Error(
      `${where} is a paid class, so it needs price (US dollars, at least 1).`,
    );
  if (accessMode !== "paid" && fields.price != null)
    throw new Error(
      `${where} has a price but access_mode is "${accessMode}"; only a "paid" class takes a price.`,
    );
  return {
    name: fields.name,
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

/**
 * Read the whole `create_classes` value. Refuses the list — before anything is
 * created — on any bad entry, a name repeated within the list, or a name the
 * person already has (so a retried write never makes duplicates).
 */
export function parseCreateClassesValue(
  value: unknown,
  existingNames: readonly string[],
): CreateClassInput[] {
  const list =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { classes?: unknown }).classes)
      ? (value as { classes: unknown[] }).classes
      : value;
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

  const inputs = list.map((entry, i) =>
    toCreateClassInput(
      `create_classes[${i}]`,
      parseClassWriteFields(`create_classes[${i}]`, entry),
    ),
  );

  const key = (name: string) => name.trim().toLowerCase();
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const input of inputs) {
    if (seen.has(key(input.name))) repeated.add(input.name);
    seen.add(key(input.name));
  }
  if (repeated.size > 0)
    throw new Error(
      `create_classes lists the same class more than once: ${[...repeated].join(", ")}. Nothing was created.`,
    );
  const existing = new Set(existingNames.map(key));
  const clashes = inputs.filter((input) => existing.has(key(input.name)));
  if (clashes.length > 0)
    throw new Error(
      `The person already has ${clashes.map((c) => `"${c.name}"`).join(", ")}. Remove ${clashes.length === 1 ? "it" : "them"} from the list (or rename) and try again. Nothing was created.`,
    );

  return inputs;
}
