// features/math/service.ts
import { createClient } from "@/utils/supabase/server";
import type { Database, Json } from "@/types/database.types";
import {
  MathProblem,
  MathProblemInsert,
  ProblemStatement,
  Solution,
  Step,
} from "./types";

type MathProblemRow = Database["education"]["Tables"]["math_problems"]["Row"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseProblemStatement(raw: Json): ProblemStatement {
  if (!isRecord(raw)) {
    return { text: "", equation: "", instruction: "" };
  }
  return {
    text: typeof raw.text === "string" ? raw.text : "",
    equation: typeof raw.equation === "string" ? raw.equation : "",
    instruction: typeof raw.instruction === "string" ? raw.instruction : "",
  };
}

function parseStep(raw: unknown): Step | null {
  if (!isRecord(raw)) return null;
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    equation: typeof raw.equation === "string" ? raw.equation : "",
    explanation:
      typeof raw.explanation === "string" ? raw.explanation : undefined,
    simplified: typeof raw.simplified === "string" ? raw.simplified : undefined,
  };
}

function parseSolutions(raw: Json): Solution[] {
  if (!Array.isArray(raw)) return [];
  const out: Solution[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const rawSteps = Array.isArray(item.steps) ? item.steps : [];
    const steps: Step[] = [];
    for (const s of rawSteps) {
      const parsed = parseStep(s);
      if (parsed) steps.push(parsed);
    }
    out.push({
      task: typeof item.task === "string" ? item.task : "",
      steps,
      solutionAnswer:
        typeof item.solutionAnswer === "string" ? item.solutionAnswer : "",
      transitionText:
        item.transitionText === null
          ? null
          : typeof item.transitionText === "string"
            ? item.transitionText
            : null,
    });
  }
  return out;
}

function mapMathRow(row: MathProblemRow): MathProblem {
  const dl = row.difficulty_level;
  const difficulty_level =
    dl === "easy" || dl === "medium" || dl === "hard" ? dl : null;

  return {
    id: row.id,
    title: row.title,
    course_name: row.course_name,
    topic_name: row.topic_name,
    module_name: row.module_name,
    description: row.description,
    intro_text: row.intro_text,
    final_statement: row.final_statement,
    problem_statement: parseProblemStatement(row.problem_statement),
    solutions: parseSolutions(row.solutions),
    hint: row.hint,
    resources: Array.isArray(row.resources)
      ? row.resources.filter((x): x is string => typeof x === "string")
      : null,
    difficulty_level,
    related_content: Array.isArray(row.related_content)
      ? row.related_content.filter((x): x is string => typeof x === "string")
      : null,
    sort_order: row.sort_order ?? 0,
    is_published: row.is_published ?? false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    created_by: row.created_by,
  };
}

/**
 * Fetch all published math problems
 */
export async function getAllMathProblems(): Promise<MathProblem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("education")
    .from("math_problems")
    .select("*")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching math problems:", error);
    throw new Error("Failed to fetch math problems");
  }

  return (data ?? []).map(mapMathRow);
}

/**
 * Fetch a single math problem by ID
 */
export async function getMathProblemById(
  id: string,
): Promise<MathProblem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("education")
    .from("math_problems")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (error) {
    console.error("Error fetching math problem:", error);
    return null;
  }

  return data ? mapMathRow(data) : null;
}

/**
 * Get math problems by course, topic, and module
 */
export async function getMathProblemsByModule(
  courseName: string,
  topicName: string,
  moduleName: string,
): Promise<MathProblem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("education")
    .from("math_problems")
    .select("*")
    .eq("course_name", courseName)
    .eq("topic_name", topicName)
    .eq("module_name", moduleName)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching math problems by module:", error);
    throw new Error("Failed to fetch math problems");
  }

  return (data ?? []).map(mapMathRow);
}

/**
 * Get unique course/topic/module combinations
 */
export async function getMathCourseStructure() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("education")
    .from("math_problems")
    .select("course_name, topic_name, module_name")
    .eq("is_published", true);

  if (error) {
    console.error("Error fetching course structure:", error);
    throw new Error("Failed to fetch course structure");
  }

  // Group by course > topic > module
  const structure: Record<string, Record<string, Set<string>>> = {};

  data?.forEach((item) => {
    if (!structure[item.course_name]) {
      structure[item.course_name] = {};
    }
    if (!structure[item.course_name][item.topic_name]) {
      structure[item.course_name][item.topic_name] = new Set();
    }
    structure[item.course_name][item.topic_name].add(item.module_name);
  });

  // Convert Sets to arrays
  return Object.entries(structure).map(([courseName, topics]) => ({
    courseName,
    topics: Object.entries(topics).map(([topicName, modules]) => ({
      topicName,
      modules: Array.from(modules),
    })),
  }));
}

/**
 * Insert a new math problem (for admin use)
 */
export async function insertMathProblem(
  problem: MathProblemInsert,
): Promise<MathProblem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("education")
    .from("math_problems")
    .insert(problem)
    .select()
    .single();

  if (error) {
    console.error("Error inserting math problem:", error);
    throw new Error("Failed to insert math problem");
  }

  return data ? mapMathRow(data) : null;
}

/**
 * Bulk insert math problems (for migrations)
 */
export async function bulkInsertMathProblems(
  problems: MathProblemInsert[],
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.schema("education").from("math_problems").insert(problems);

  if (error) {
    console.error("Error bulk inserting math problems:", error);
    throw new Error("Failed to bulk insert math problems");
  }
}
