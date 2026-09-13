// features/math/types.ts

import type { Database } from "@/types/database.types";

/**
 * Step within a solution for a problem
 */
export type Step = {
    title: string;
    equation: string;
    explanation?: string;
    simplified?: string;
};

/**
 * Solution structure containing multiple steps and the final answer
 */
export type Solution = {
    task: string;
    steps: Step[];
    solutionAnswer: string;
    transitionText: string | null;
};

/**
 * Problem statement with text, equation, and instructions
 */
export type ProblemStatement = {
    text: string;
    equation: string;
    instruction: string;
};

/**
 * Math problem structure - matches database schema
 */
export type MathProblem = {
    id: string;
    title: string;
    course_name: string;
    topic_name: string;
    module_name: string;
    description: string | null;
    intro_text: string | null;
    final_statement: string | null;
    problem_statement: ProblemStatement;
    solutions: Solution[];
    hint: string | null;
    resources: string[] | null;
    difficulty_level: 'easy' | 'medium' | 'hard' | null;
    related_content: string[] | null;
    sort_order: number;
    is_published: boolean;
    created_at: string;
    updated_at: string;
    created_by: string | null;
};

/**
 * Insert type for creating new math problems
 */
export type MathProblemInsert =
    Database["education"]["Tables"]["math_problems"]["Insert"];

/**
 * Props for the MathProblem component
 */
export type MathProblemProps = Pick<
    MathProblem,
    | 'id'
    | 'title'
    | 'course_name'
    | 'topic_name'
    | 'module_name'
    | 'description'
    | 'intro_text'
    | 'final_statement'
    | 'problem_statement'
    | 'solutions'
>;
