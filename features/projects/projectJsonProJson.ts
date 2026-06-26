/**
 * ProJsonTextarea wiring for the project JSON import contract.
 *
 * Keeps AJV schema, allowed keys, and domain validators next to
 * `validateProjectJson` in importJson.ts without pulling React into that module.
 */

import type { AnySchema } from "ajv";
import type {
  ProJsonValidator,
  ProJsonValidationIssue,
} from "@/components/official/ProJsonTextarea";
import { validateProjectJson } from "./importJson";

export const PROJECT_JSON_ALLOWED_TOP_LEVEL_KEYS = [
  "name",
  "slug",
  "description",
  "start_date",
  "end_date",
  "tasks",
] as const;

export const projectJsonSchema: AnySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: true,
  properties: {
    name: { type: "string", minLength: 1 },
    slug: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    start_date: { type: ["string", "null"] },
    end_date: { type: ["string", "null"] },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        additionalProperties: true,
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: ["string", "null"] },
          subtasks: {
            type: "array",
            items: {
              type: "object",
              required: ["name"],
              additionalProperties: true,
              properties: {
                name: { type: "string", minLength: 1 },
                description: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
};

function bracketPathToPointer(message: string): string | undefined {
  const match = message.match(
    /`(tasks\[\d+\](?:\.subtasks\[\d+\])?(?:\.\w+)?|(?:name|slug|description|start_date|end_date|tasks))`/,
  );
  if (!match) return undefined;

  const raw = match[1];
  if (!raw.startsWith("tasks[")) {
    return `/${raw}`;
  }

  return "/" + raw.replace(/\]\./g, "/").replace(/\[/g, "/").replace(/\]/g, "");
}

function mapProjectValidationIssues(text: string): ProJsonValidationIssue[] {
  const result = validateProjectJson(text);
  const issues: ProJsonValidationIssue[] = [];

  for (const message of result.errors) {
    issues.push({
      kind: "custom",
      severity: "error",
      message,
      path: bracketPathToPointer(message),
      source: "project contract",
    });
  }

  for (const message of result.warnings) {
    issues.push({
      kind: "custom",
      severity: "warning",
      message,
      path: bracketPathToPointer(message),
      source: "project contract",
    });
  }

  return issues;
}

/** Domain validator — ISO dates, trimmed names, task/subtask rollup rules. */
export const projectJsonCustomValidator: ProJsonValidator = ({ text }) =>
  mapProjectValidationIssues(text);

export const projectJsonValidators: readonly ProJsonValidator[] = [
  projectJsonCustomValidator,
];
