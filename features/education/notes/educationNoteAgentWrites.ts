import {
  collectProblems,
  ListLevelProblem,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import type { OwnedEducationNoteScopeEntry } from "@/features/surfaces/manifests/education-notes.manifest";

function record(
  where: string,
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where} must be an object.`);
  }
  const result = value as Record<string, unknown>;
  const unknown = Object.keys(result).filter((key) => !keys.includes(key));
  if (unknown.length > 0)
    throw new Error(`${where} does not accept ${unknown.join(", ")}.`);
  return result;
}

function requiredTitle(where: string, raw: unknown): string {
  if (typeof raw !== "string") throw new Error(`${where}.title is required.`);
  const title = raw.trim();
  if (!title) throw new Error(`${where}.title cannot be empty.`);
  if (/\r|\n/.test(title))
    throw new Error(`${where}.title must be a single line.`);
  return title;
}

function optionalTags(where: string, raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (
    !Array.isArray(raw) ||
    raw.some((tag) => typeof tag !== "string" || !tag.trim())
  ) {
    throw new Error(`${where}.tags must be an array of non-empty strings.`);
  }
  return raw.map((tag) => tag.trim());
}

function idAndVersion(
  where: string,
  value: Record<string, unknown>,
  current: OwnedEducationNoteScopeEntry,
) {
  if (typeof value.id !== "string" || !value.id.trim())
    throw new Error(`${where}.id is required.`);
  if (
    !Number.isInteger(value.expected_version) ||
    (value.expected_version as number) < 1
  ) {
    throw new Error(`${where}.expected_version must be a positive integer.`);
  }
  if (value.expected_version !== current.version) {
    throw new ListLevelProblem(
      `${where}.expected_version does not match the loaded version for "${current.title}". Reload the list and try again.`,
    );
  }
}

export interface CreateEducationNotePlan {
  title: string;
  content: string;
  tags: string[];
}

export function parseCreateEducationNotes(
  value: unknown,
): CreateEducationNotePlan[] {
  const target = "create_education_notes";
  return collectProblems(
    target,
    readCollectionList(target, "Education notes", value, 10),
    (entry, index) => {
      const where = `${target}[${index}]`;
      const item = record(where, entry, ["title", "content", "tags"]);
      if (item.content !== undefined && typeof item.content !== "string")
        throw new Error(`${where}.content must be text.`);
      return {
        title: requiredTitle(where, item.title),
        content: item.content ?? "",
        tags: optionalTags(where, item.tags) ?? [],
      };
    },
  );
}

export interface UpdateEducationNotePlan {
  id: string;
  title: string;
  tags?: string[];
  expectedVersion: number;
  organizationId: string;
  changed: string[];
}

export function parseUpdateEducationNotes(
  value: unknown,
  current: readonly OwnedEducationNoteScopeEntry[],
): UpdateEducationNotePlan[] {
  const target = "update_education_notes";
  return collectProblems(
    target,
    readCollectionList(target, "Education notes", value, 10),
    (entry, index) => {
      const where = `${target}[${index}]`;
      const item = record(where, entry, [
        "id",
        "expected_version",
        "title",
        "tags",
      ]);
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const note = current.find((candidate) => candidate.id === id);
      if (!note)
        throw new ListLevelProblem(
          `${where}.id is not one of the loaded Education notes you own.`,
        );
      idAndVersion(where, item, note);
      const title =
        item.title === undefined ? undefined : requiredTitle(where, item.title);
      const tags = optionalTags(where, item.tags);
      const changed = [
        ...(title !== undefined && title !== note.title ? ["title"] : []),
        ...(tags !== undefined ? ["tags"] : []),
      ];
      if (changed.length === 0)
        throw new Error(`${where} changes nothing on "${note.title}".`);
      return {
        id: note.id,
        title: title ?? note.title,
        ...(tags !== undefined ? { tags } : {}),
        expectedVersion: note.version,
        organizationId: note.organization_id,
        changed,
      };
    },
    {
      listChecks: (items) => [
        repeatsProblem(
          target,
          items.map((item) => (item.ok ? item.value?.id : undefined)),
          "id",
          "Merge changes into one entry.",
        ),
      ],
    },
  );
}

export interface DeleteEducationNotePlan {
  id: string;
  title: string;
  expectedVersion: number;
  organizationId: string;
}

export function parseDeleteEducationNotes(
  value: unknown,
  current: readonly OwnedEducationNoteScopeEntry[],
): DeleteEducationNotePlan[] {
  const target = "delete_education_notes";
  return collectProblems(
    target,
    readCollectionList(target, "Education notes", value, 10),
    (entry, index) => {
      const where = `${target}[${index}]`;
      const item = record(where, entry, ["id", "expected_version"]);
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const note = current.find((candidate) => candidate.id === id);
      if (!note)
        throw new ListLevelProblem(
          `${where}.id is not one of the loaded Education notes you own.`,
        );
      idAndVersion(where, item, note);
      return {
        id: note.id,
        title: note.title,
        expectedVersion: note.version,
        organizationId: note.organization_id,
      };
    },
    {
      listChecks: (items) => [
        repeatsProblem(
          target,
          items.map((item) => (item.ok ? item.value?.id : undefined)),
          "id",
          "Remove duplicate ids.",
        ),
      ],
    },
  );
}
