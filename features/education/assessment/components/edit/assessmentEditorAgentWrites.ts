import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import {
  isDepth,
  isQuestionType,
  type AssessmentItemPatch,
  type AssessmentPatch,
  type NewAssessmentItemInput,
} from "../../data/types";

type RecordValue = Record<string, unknown>;

export type EditableAssessment = { id: string; version: number; title: string };
export type EditableItem = { id: string; version: number; prompt: string };

export type AssessmentUpdatePlan = {
  expectedVersion: number;
  patch: AssessmentPatch;
};

export type ItemUpdatePlan = {
  id: string;
  expectedVersion: number;
  patch: AssessmentItemPatch;
};

export type ItemDeletePlan = Pick<ItemUpdatePlan, "id" | "expectedVersion">;

function object(value: unknown, where: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${where} must be an object.`);
  return value as RecordValue;
}

function requiredText(value: unknown, where: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${where} must be non-empty text.`);
  return value.trim();
}

function optionalText(value: unknown, where: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string")
    throw new Error(`${where} must be text or null.`);
  return value.trim() || null;
}

function expectedVersion(value: unknown, where: string): number {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new Error(
      `${where} must be a positive integer from the loaded record.`,
    );
  return value as number;
}

function fields(
  value: RecordValue,
  allowed: readonly string[],
  where: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new Error(`${where} does not accept ${unknown.join(", ")}.`);
}

function strings(value: unknown, where: string): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
    throw new Error(`${where} must be an array of strings or null.`);
  return value.map((entry) => entry.trim());
}

export function parseUpdateAssessment(
  value: unknown,
  current: EditableAssessment,
): AssessmentUpdatePlan {
  const raw = object(value, "update_assessment");
  fields(raw, ["expected_version", "title"], "update_assessment");
  const version = expectedVersion(
    raw.expected_version,
    "update_assessment.expected_version",
  );
  if (version !== current.version)
    throw new Error(
      `update_assessment.expected_version ${version} does not match the loaded version ${current.version}. Reload the assessment and prepare the update again.`,
    );
  if (!("title" in raw))
    throw new Error("update_assessment needs title to change.");
  const title = requiredText(raw.title, "update_assessment.title");
  if (title === current.title)
    throw new Error("update_assessment changes nothing.");
  return { expectedVersion: version, patch: { title } };
}

function parseNewItem(value: unknown, where: string): NewAssessmentItemInput {
  const raw = object(value, where);
  fields(
    raw,
    [
      "question_type",
      "prompt",
      "options",
      "correct_answer",
      "acceptable_answers",
      "explanation",
      "rubric",
      "depth",
      "points",
      "topic",
    ],
    where,
  );
  const questionType = requiredText(
    raw.question_type,
    `${where}.question_type`,
  );
  if (!isQuestionType(questionType))
    throw new Error(`${where}.question_type is not supported.`);
  const prompt = requiredText(raw.prompt, `${where}.prompt`);
  if (
    "depth" in raw &&
    raw.depth !== null &&
    (typeof raw.depth !== "string" || !isDepth(raw.depth))
  )
    throw new Error(`${where}.depth must be recall, applied, exam, or null.`);
  if (
    "points" in raw &&
    (!Number.isFinite(raw.points) || (raw.points as number) <= 0)
  )
    throw new Error(`${where}.points must be a positive number.`);
  return {
    questionType,
    prompt,
    ...("options" in raw
      ? { options: strings(raw.options, `${where}.options`) }
      : {}),
    ...("correct_answer" in raw
      ? {
          correctAnswer: optionalText(
            raw.correct_answer,
            `${where}.correct_answer`,
          ),
        }
      : {}),
    ...("acceptable_answers" in raw
      ? {
          acceptableAnswers: strings(
            raw.acceptable_answers,
            `${where}.acceptable_answers`,
          ),
        }
      : {}),
    ...("explanation" in raw
      ? { explanation: optionalText(raw.explanation, `${where}.explanation`) }
      : {}),
    ...("rubric" in raw
      ? { rubric: optionalText(raw.rubric, `${where}.rubric`) }
      : {}),
    ...("depth" in raw
      ? { depth: raw.depth as NewAssessmentItemInput["depth"] }
      : {}),
    ...("points" in raw ? { points: raw.points as number } : {}),
    ...("topic" in raw
      ? { topic: optionalText(raw.topic, `${where}.topic`) }
      : {}),
  };
}

export function parseAddAssessmentItems(
  value: unknown,
  assessmentVersion: number,
): NewAssessmentItemInput[] {
  return collectProblems(
    "add_assessment_items",
    readCollectionList("add_assessment_items", "items", value),
    (item, index) => {
      const where = `add_assessment_items[${index}]`;
      const raw = object(item, where);
      fields(
        raw,
        [
          "expected_assessment_version",
          "question_type",
          "prompt",
          "options",
          "correct_answer",
          "acceptable_answers",
          "explanation",
          "rubric",
          "depth",
          "points",
          "topic",
        ],
        where,
      );
      const expected = expectedVersion(
        raw.expected_assessment_version,
        `${where}.expected_assessment_version`,
      );
      if (expected !== assessmentVersion)
        throw new Error(
          `${where}.expected_assessment_version ${expected} does not match the loaded assessment version ${assessmentVersion}. Reload the assessment and prepare the addition again.`,
        );
      const newItem = { ...raw };
      delete newItem.expected_assessment_version;
      return parseNewItem(newItem, where);
    },
  );
}

function itemPlan(
  value: unknown,
  index: number,
  current: readonly EditableItem[],
): ItemUpdatePlan {
  const where = `update_assessment_items[${index}]`;
  const raw = object(value, where);
  fields(
    raw,
    [
      "id",
      "expected_version",
      "question_type",
      "prompt",
      "options",
      "correct_answer",
      "acceptable_answers",
      "explanation",
      "rubric",
      "depth",
      "points",
      "topic",
    ],
    where,
  );
  const id = requiredText(raw.id, `${where}.id`);
  const row = current.find((item) => item.id === id);
  if (!row)
    throw new Error(
      `${where}: ${id} is not a loaded question on this assessment.`,
    );
  const version = expectedVersion(
    raw.expected_version,
    `${where}.expected_version`,
  );
  if (version !== row.version)
    throw new Error(
      `${where}.expected_version ${version} does not match the loaded version ${row.version}. Reload the assessment and prepare the update again.`,
    );
  const changed = Object.keys(raw).filter(
    (key) => key !== "id" && key !== "expected_version",
  );
  if (!changed.length)
    throw new Error(`${where} needs at least one field to change.`);
  const itemInput = { ...raw };
  delete itemInput.id;
  delete itemInput.expected_version;
  const patch = parseNewItem(
    {
      ...itemInput,
      question_type: raw.question_type ?? "short_answer",
      prompt: raw.prompt ?? row.prompt,
    },
    where,
  );
  const itemPatch: AssessmentItemPatch = {};
  if ("question_type" in raw) itemPatch.question_type = patch.questionType;
  if ("prompt" in raw) itemPatch.prompt = patch.prompt;
  if ("options" in raw) itemPatch.options = patch.options as never;
  if ("correct_answer" in raw)
    itemPatch.correct_answer = patch.correctAnswer ?? null;
  if ("acceptable_answers" in raw)
    itemPatch.acceptable_answers = patch.acceptableAnswers as never;
  if ("explanation" in raw) itemPatch.explanation = patch.explanation ?? null;
  if ("rubric" in raw) itemPatch.rubric = patch.rubric ?? null;
  if ("depth" in raw) itemPatch.depth = patch.depth ?? null;
  if ("points" in raw) itemPatch.points = patch.points ?? 1;
  if ("topic" in raw) itemPatch.topic = patch.topic ?? null;
  return { id, expectedVersion: version, patch: itemPatch };
}

export function parseUpdateAssessmentItems(
  value: unknown,
  current: readonly EditableItem[],
): ItemUpdatePlan[] {
  return collectProblems(
    "update_assessment_items",
    readCollectionList("update_assessment_items", "items", value),
    (item, index) => itemPlan(item, index, current),
    {
      listChecks: (items) => [
        repeatsProblem(
          "update_assessment_items",
          items.map((item) => item.value?.id),
          "id",
        ),
      ],
    },
  );
}

export function parseDeleteAssessmentItems(
  value: unknown,
  current: readonly EditableItem[],
): ItemDeletePlan[] {
  return collectProblems(
    "delete_assessment_items",
    readCollectionList("delete_assessment_items", "items", value),
    (item, index) => {
      const where = `delete_assessment_items[${index}]`;
      const raw = object(item, where);
      fields(raw, ["id", "expected_version"], where);
      const id = requiredText(raw.id, `${where}.id`);
      const row = current.find((candidate) => candidate.id === id);
      if (!row)
        throw new Error(
          `${where}: ${id} is not a loaded question on this assessment.`,
        );
      const version = expectedVersion(
        raw.expected_version,
        `${where}.expected_version`,
      );
      if (version !== row.version)
        throw new Error(
          `${where}.expected_version ${version} does not match the loaded version ${row.version}. Reload the assessment and prepare the deletion again.`,
        );
      return { id, expectedVersion: version };
    },
    {
      listChecks: (items) => [
        repeatsProblem(
          "delete_assessment_items",
          items.map((item) => item.value?.id),
          "id",
        ),
      ],
    },
  );
}
