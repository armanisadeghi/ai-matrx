import type { Json } from "@/types/database.types";
import {
  collectProblems,
  ListLevelProblem,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import type {
  MathProblemInsert,
  MathProblemRow,
  MathProblemUpdate,
} from "./admin-service";

const WRITE_KEYS = [
  "title", "course_name", "topic_name", "module_name", "description",
  "intro_text", "final_statement", "hint", "difficulty_level", "sort_order",
  "problem_statement", "solutions",
] as const;

type WriteFields = {
  title?: string;
  course_name?: string;
  topic_name?: string;
  module_name?: string;
  description?: string | null;
  intro_text?: string | null;
  final_statement?: string | null;
  hint?: string | null;
  difficulty_level?: "easy" | "medium" | "hard" | null;
  sort_order?: number;
  problem_statement?: Json;
  solutions?: Json;
};

export type MathProblemUpdatePlan = {
  id: string;
  version: number;
  name: string;
  patch: MathProblemUpdate;
  changed: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJson(value: unknown): value is Json {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required plain text.`);
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be plain text or null.`);
  return value.trim() || null;
}

function requiredProblemStatement(value: unknown): Json {
  if (!isRecord(value)) throw new Error("problem_statement must be { text, equation, instruction }.");
  for (const key of ["text", "equation", "instruction"]) requiredText(value[key], `problem_statement.${key}`);
  if (!isJson(value)) throw new Error("problem_statement contains unsupported JSON.");
  return value;
}

function requiredSolutions(value: unknown): Json {
  if (!Array.isArray(value) || value.length === 0) throw new Error("solutions must be a non-empty JSON array.");
  if (!isJson(value)) throw new Error("solutions contains unsupported JSON.");
  return value;
}

function readFields(value: unknown, target: string, required: boolean): WriteFields {
  if (!isRecord(value)) throw new Error(`${target} item must be an object.`);
  const unknown = Object.keys(value).filter((key) => key !== "id" && !(target === "update_math_problems" && key === "version") && !(WRITE_KEYS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`${target} does not accept ${unknown.join(", ")}.`);
  const fields: WriteFields = {};
  for (const key of ["title", "course_name", "topic_name", "module_name"] as const) {
    if (key in value) fields[key] = requiredText(value[key], key);
    else if (required) throw new Error(`${key} is required.`);
  }
  for (const key of ["description", "intro_text", "final_statement", "hint"] as const) {
    if (key in value) fields[key] = optionalText(value[key], key);
  }
  if ("difficulty_level" in value) {
    const difficulty = value.difficulty_level;
    if (difficulty !== null && difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
      throw new Error("difficulty_level must be easy, medium, hard, or null.");
    }
    fields.difficulty_level = difficulty;
  }
  if ("sort_order" in value) {
    if (!Number.isInteger(value.sort_order) || typeof value.sort_order !== "number" || value.sort_order < 0) {
      throw new Error("sort_order must be a whole number of zero or more.");
    }
    fields.sort_order = value.sort_order;
  }
  if ("problem_statement" in value) fields.problem_statement = requiredProblemStatement(value.problem_statement);
  else if (required) throw new Error("problem_statement is required.");
  if ("solutions" in value) fields.solutions = requiredSolutions(value.solutions);
  else if (required) throw new Error("solutions is required.");
  return fields;
}

function rawName(value: unknown): string | undefined {
  return isRecord(value) && typeof value.title === "string" ? value.title.trim() || undefined : undefined;
}

export function parseCreateMathProblems(value: unknown, existingRows: readonly MathProblemRow[]): Omit<MathProblemInsert, "organization_id">[] {
  const list = readCollectionList("create_math_problems", "math_problems", value);
  const existingNames = new Set(existingRows.map((row) => row.title.trim().toLowerCase()));
  return collectProblems("create_math_problems", list, (entry) => {
    const fields = readFields(entry, "create_math_problems", true);
    if (
      !fields.title || !fields.course_name || !fields.topic_name || !fields.module_name ||
      fields.problem_statement === undefined || fields.solutions === undefined
    ) {
      throw new Error("is missing a required Quick Math field.");
    }
    return {
      title: fields.title,
      course_name: fields.course_name,
      topic_name: fields.topic_name,
      module_name: fields.module_name,
      problem_statement: fields.problem_statement,
      solutions: fields.solutions,
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.intro_text !== undefined ? { intro_text: fields.intro_text } : {}),
      ...(fields.final_statement !== undefined ? { final_statement: fields.final_statement } : {}),
      ...(fields.hint !== undefined ? { hint: fields.hint } : {}),
      ...(fields.difficulty_level !== undefined ? { difficulty_level: fields.difficulty_level } : {}),
      ...(fields.sort_order !== undefined ? { sort_order: fields.sort_order } : {}),
      metadata: {}, visibility: "internal", is_published: false,
    };
  }, {
    nameOf: rawName,
    listChecks: (items) => [
      repeatsProblem("create_math_problems", items.map((item) => item.name), "problem title"),
      ...items.filter((item) => item.name && existingNames.has(item.name.toLowerCase())).map((item) =>
        `A problem named "${item.name}" already exists (create_math_problems[${item.index}]). Rename it before creating another.`,
      ),
    ],
  });
}

export function parseUpdateMathProblems(value: unknown, rows: readonly MathProblemRow[]): MathProblemUpdatePlan[] {
  const list = readCollectionList("update_math_problems", "math_problems", value);
  return collectProblems("update_math_problems", list, (entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()) throw new Error("id is required.");
    const row = rows.find((candidate) => candidate.id === entry.id);
    if (!row) throw new ListLevelProblem(`update_math_problems names unknown or unavailable id ${entry.id}.`);
    if (!Number.isSafeInteger(entry.version) || entry.version !== row.version) throw new Error("version must match the loaded problem; reload before updating.");
    const fields = readFields(entry, "update_math_problems", false);
    const changed = Object.keys(fields);
    if (changed.length === 0) throw new Error("needs at least one field to change.");
    return { id: row.id, version: row.version, name: row.title, patch: fields, changed };
  }, {
    listChecks: (items) => [repeatsProblem("update_math_problems", items.map((item) => item.ok ? item.value?.id : undefined), "id")],
  });
}

export function parseDeleteMathProblems(value: unknown, rows: readonly MathProblemRow[]): MathProblemRow[] {
  const list = readCollectionList("delete_math_problems", "math_problems", value);
  return collectProblems("delete_math_problems", list, (entry) => {
    const id = isRecord(entry) && typeof entry.id === "string" ? entry.id : "";
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) throw new ListLevelProblem(`delete_math_problems names unknown or unavailable id ${id || "(missing)"}.`);
    if (!isRecord(entry) || !Number.isSafeInteger(entry.version) || entry.version !== row.version) throw new Error("version must match the loaded problem; reload before deleting.");
    return row;
  }, {
    listChecks: (items) => [repeatsProblem("delete_math_problems", items.map((item) => item.ok ? item.value?.id : undefined), "id")],
  });
}
