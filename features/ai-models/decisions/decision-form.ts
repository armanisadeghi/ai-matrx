export type DecisionValue = unknown;

export type DecisionQuestion =
  | {
      id: string;
      name: string;
      type: "choice";
      instructions: string;
      instructionsMode: "text" | "json";
      instructionsJson: string;
      criteriaMode: "rows" | "json";
      criteriaJson: string;
      criteria: Array<{ key: string; description: string }>;
    }
  | {
      id: string;
      name: string;
      type: "score";
      instructions: string;
      instructionsMode: "text" | "json";
      instructionsJson: string;
      criteriaMode: "rows" | "json";
      criteriaJson: string;
      criteria: string[];
    }
  | {
      id: string;
      name: string;
      type: "noul";
      instructions: string;
      instructionsMode: "text" | "json";
      instructionsJson: string;
      criteriaMode: "rows" | "json";
      criteriaJson: string;
      criteria: { true: string; false: string };
    };

export function newQuestion(): DecisionQuestion {
  return {
    id: crypto.randomUUID(),
    name: "decision",
    type: "choice",
    instructions: "",
    instructionsMode: "text",
    instructionsJson: "{}",
    criteriaMode: "rows",
    criteriaJson: "{}",
    criteria: [
      { key: "yes", description: "" },
      { key: "no", description: "" },
    ],
  };
}

export function parseDecisionValue(
  source: string,
  mode: "text" | "json",
  field: string,
): { value?: DecisionValue; error?: string } {
  if (mode === "text") return { value: source };
  try {
    const value: unknown = JSON.parse(source);
    if (value === null || typeof value !== "object") {
      return { error: `${field} JSON must be an object or array.` };
    }
    return { value };
  } catch {
    return { error: `${field} must be valid JSON.` };
  }
}

export function isDecisionQuestionType(value: string): value is DecisionQuestion["type"] {
  return value === "choice" || value === "score" || value === "noul";
}

export function questionErrors(questions: DecisionQuestion[]): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const question of questions) {
    const name = question.name.trim();
    if (!name) errors.push("Every question needs a name.");
    else if (names.has(name)) errors.push(`Question name “${name}” is repeated.`);
    else names.add(name);
    const parsedInstructions = parseDecisionValue(
      question.instructionsMode === "text" ? question.instructions : question.instructionsJson,
      question.instructionsMode,
      `“${name || "Unnamed question"}” instructions`,
    );
    if (parsedInstructions.error || (question.instructionsMode === "text" && !question.instructions.trim())) {
      errors.push(`“${name || "Unnamed question"}” needs instructions.`);
    }
    if (question.criteriaMode === "json") {
      const parsedCriteria = parseDecisionValue(question.criteriaJson, "json", `“${name || "Unnamed question"}” criteria`);
      if (parsedCriteria.error) errors.push(parsedCriteria.error);
      else if (question.type === "score" && !Array.isArray(parsedCriteria.value)) errors.push(`“${name || "Unnamed question"}” score criteria JSON must be an array.`);
      else if (question.type !== "score" && (Array.isArray(parsedCriteria.value) || typeof parsedCriteria.value !== "object")) errors.push(`“${name || "Unnamed question"}” criteria JSON must be an object.`);
      continue;
    }
    if (question.type === "choice") {
      const keys = new Set<string>();
      for (const criterion of question.criteria) {
        const key = criterion.key.trim();
        if (!key) errors.push(`“${name || "Unnamed question"}” has an unnamed choice.`);
        else if (keys.has(key)) errors.push(`“${name || "Unnamed question"}” repeats choice “${key}”.`);
        else keys.add(key);
      }
      if (question.criteria.length < 2) errors.push(`“${name || "Unnamed question"}” needs at least two choices.`);
    }
    if (question.type === "score") {
      const unique = new Set(question.criteria.map((criterion) => criterion.trim()).filter(Boolean));
      if (unique.size < 2) errors.push(`“${name || "Unnamed question"}” needs two distinct score levels.`);
    }
  }
  return errors;
}

export function decisionQuestionPayload(question: DecisionQuestion): Record<string, unknown> | null {
  const instructionSource = question.instructionsMode === "text" ? question.instructions : question.instructionsJson;
  const instructions = parseDecisionValue(instructionSource, question.instructionsMode, "Instructions").value;
  if (instructions === undefined) return null;
  if (question.criteriaMode === "json") {
    const criteria = parseDecisionValue(question.criteriaJson, "json", "Criteria").value;
    return criteria === undefined ? null : { type: question.type, instructions, criteria };
  }
  if (question.type === "choice") {
    return { type: "choice", instructions, criteria: Object.fromEntries(question.criteria.map((criterion) => [criterion.key.trim(), criterion.description.trim() || null])) };
  }
  return { type: question.type, instructions, criteria: question.criteria };
}
