/**
 * Math Problem Import Utility
 * 
 * Handles importing AI-generated math problems into the database.
 * Validates structure and inserts problems using the service layer.
 */

import { v4 as uuidv4 } from 'uuid';
import { insertMathProblem, bulkInsertMathProblems } from '../service';
import { MathProblemInsert } from '../types';
import { normalizeMathProblemLatex } from './latex-normalizer';
import { extractErrorMessage } from '@/utils/errors';

/**
 * Input format from AI (matches generation guide)
 * Note: id is optional and will be auto-generated if not provided
 */
export type AIGeneratedProblem = {
    title: string;
    course_name: string;
    topic_name: string;
    module_name: string;
    description?: string;
    intro_text?: string;
    final_statement?: string;
    difficulty_level?: 'easy' | 'medium' | 'hard';
    sort_order?: number;
    problem_statement: {
        text: string;
        equation: string;
        instruction: string;
    };
    solutions: Array<{
        task: string;
        steps: Array<{
            title: string;
            equation: string;
            explanation?: string;
            simplified?: string;
        }>;
        solutionAnswer: string;
        transitionText?: string | null;
    }>;
    hint?: string;
    resources?: string[];
    related_content?: string[];
};

/**
 * Validation result
 */
export type ValidationResult = {
    valid: boolean;
    errors: string[];
};

/**
 * Import result
 */
export type ImportResult = {
    success: boolean;
    inserted: number;
    failed: number;
    errors: Array<{
        problem: string;
        error: string;
    }>;
};

/**
 * Validate a single problem structure
 */
export function validateProblem(problem: any): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!problem.title) errors.push('Missing required field: title');
    if (!problem.course_name) errors.push('Missing required field: course_name');
    if (!problem.topic_name) errors.push('Missing required field: topic_name');
    if (!problem.module_name) errors.push('Missing required field: module_name');

    // Problem statement
    if (!problem.problem_statement) {
        errors.push('Missing required field: problem_statement');
    } else {
        if (!problem.problem_statement.text) errors.push('Missing problem_statement.text');
        if (!problem.problem_statement.equation) errors.push('Missing problem_statement.equation');
        if (!problem.problem_statement.instruction) errors.push('Missing problem_statement.instruction');
    }

    // Solutions
    if (!problem.solutions || !Array.isArray(problem.solutions)) {
        errors.push('Missing or invalid solutions array');
    } else if (problem.solutions.length === 0) {
        errors.push('Solutions array must have at least one solution');
    } else {
        problem.solutions.forEach((solution: any, idx: number) => {
            if (!solution.task) errors.push(`Solution ${idx}: missing task`);
            if (!solution.solutionAnswer) errors.push(`Solution ${idx}: missing solutionAnswer`);
            if (!solution.steps || !Array.isArray(solution.steps)) {
                errors.push(`Solution ${idx}: missing or invalid steps array`);
            } else if (solution.steps.length === 0) {
                errors.push(`Solution ${idx}: steps array must have at least one step`);
            } else {
                solution.steps.forEach((step: any, stepIdx: number) => {
                    if (!step.title) errors.push(`Solution ${idx}, Step ${stepIdx}: missing title`);
                    if (!step.equation) errors.push(`Solution ${idx}, Step ${stepIdx}: missing equation`);
                });
            }
        });
    }

    // Difficulty level validation
    if (problem.difficulty_level && !['easy', 'medium', 'hard'].includes(problem.difficulty_level)) {
        errors.push('difficulty_level must be "easy", "medium", or "hard"');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Transform AI-generated problem to database format
 * Applies LaTeX normalization to fix common AI mistakes
 */
export function transformProblem(
    problem: AIGeneratedProblem,
    organizationId: string,
): MathProblemInsert {
    // First, normalize all LaTeX content to fix common AI mistakes
    const normalized = normalizeMathProblemLatex(problem);
    
    return {
        id: uuidv4(), // Always generate new UUID
        title: normalized.title,
        course_name: normalized.course_name,
        topic_name: normalized.topic_name,
        module_name: normalized.module_name,
        description: normalized.description || null,
        intro_text: normalized.intro_text || null,
        final_statement: normalized.final_statement || null,
        problem_statement: normalized.problem_statement,
        solutions: normalized.solutions.map((solution: any) => ({
            ...solution,
            transitionText: solution.transitionText ?? null
        })),
        hint: normalized.hint || null,
        resources: normalized.resources || null,
        difficulty_level: normalized.difficulty_level || null,
        related_content: normalized.related_content || null,
        sort_order: normalized.sort_order || 0,
        is_published: true,
        created_by: null,
        organization_id: organizationId,
        visibility: "internal",
    };
}

/**
 * Import a single math problem
 * 
 * @param problem AI-generated problem data
 * @param validate Whether to validate before importing (default: true)
 * @returns Success status and any errors
 */
export async function importMathProblem(
    problem: AIGeneratedProblem,
    organizationId: string,
    validate: boolean = true
): Promise<{ success: boolean; error?: string }> {
    try {
        // Validate if requested
        if (validate) {
            const validation = validateProblem(problem);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`
                };
            }
        }

        // Transform and insert
        const transformed = transformProblem(problem, organizationId);
        await insertMathProblem(transformed);

        return { success: true };
    } catch (error: unknown) {
        return {
            success: false,
            error: extractErrorMessage(error)
        };
    }
}

/**
 * Import multiple math problems (bulk import)
 * 
 * @param problems Array of AI-generated problems
 * @param validate Whether to validate before importing (default: true)
 * @param stopOnError Whether to stop on first error (default: false)
 * @returns Import summary with success/failure counts
 */
export async function importMathProblems(
    problems: AIGeneratedProblem[],
    organizationId: string,
    validate: boolean = true,
    stopOnError: boolean = false
): Promise<ImportResult> {
    const result: ImportResult = {
        success: true,
        inserted: 0,
        failed: 0,
        errors: []
    };

    // Process each problem
    for (const problem of problems) {
        try {
            // Validate if requested
            if (validate) {
                const validation = validateProblem(problem);
                if (!validation.valid) {
                    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                }
            }

            // Transform and insert
            const transformed = transformProblem(problem, organizationId);
            await insertMathProblem(transformed);
            result.inserted++;
        } catch (error: unknown) {
            result.failed++;
            result.errors.push({
                problem: problem.title || 'Unknown',
                error: extractErrorMessage(error)
            });

            if (stopOnError) {
                result.success = false;
                break;
            }
        }
    }

    // Overall success if no failures
    result.success = result.failed === 0;

    return result;
}

/**
 * Import from JSON string
 * 
 * Handles both single object, wrapped object, and array of objects.
 * Supports both direct format and wrapped format: { "math_problem": {...} }
 * 
 * @param jsonString JSON string from AI model
 * @param validate Whether to validate (default: true)
 * @returns Import result
 */
export async function importFromJSON(
    jsonString: string,
    organizationId: string,
    validate: boolean = true
): Promise<ImportResult> {
    try {
        const parsed = JSON.parse(jsonString);
        
        // Check if it's wrapped in math_problem key
        let problems: AIGeneratedProblem[];
        if (parsed.math_problem) {
            // Unwrap the math_problem object
            problems = [parsed.math_problem];
        } else if (Array.isArray(parsed)) {
            // Handle array (check each item for wrapping)
            problems = parsed.map(item => 
                item.math_problem ? item.math_problem : item
            );
        } else {
            // Assume it's a direct problem object
            problems = [parsed];
        }
        
        return await importMathProblems(problems, organizationId, validate);
    } catch (error: any) {
        return {
            success: false,
            inserted: 0,
            failed: 1,
            errors: [{
                problem: 'JSON Parse',
                error: error?.message || 'Invalid JSON format'
            }]
        };
    }
}

/**
 * Validate JSON string without importing
 * 
 * Useful for testing AI output before committing to database.
 * Supports both direct format and wrapped format: { "math_problem": {...} }
 * 
 * @param jsonString JSON string to validate
 * @returns Validation results for all problems
 */
export function validateJSON(jsonString: string): {
    valid: boolean;
    problems: Array<{
        title: string;
        valid: boolean;
        errors: string[];
    }>;
} {
    try {
        const parsed = JSON.parse(jsonString);
        
        // Check if it's wrapped in math_problem key
        let problems: any[];
        if (parsed.math_problem) {
            problems = [parsed.math_problem];
        } else if (Array.isArray(parsed)) {
            problems = parsed.map(item => 
                item.math_problem ? item.math_problem : item
            );
        } else {
            problems = [parsed];
        }
        
        const results = problems.map(problem => ({
            title: problem.title || 'Untitled',
            ...validateProblem(problem)
        }));
        
        return {
            valid: results.every(r => r.valid),
            problems: results
        };
    } catch (error) {
        return {
            valid: false,
            problems: [{
                title: 'JSON Parse Error',
                valid: false,
                errors: ['Invalid JSON format']
            }]
        };
    }
}
