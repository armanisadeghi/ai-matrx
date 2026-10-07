/**
 * Math Problem Persistence Utilities
 * 
 * Handles saving, downloading, and uploading math problem data
 */

import type { MathProblemProps } from "../types";
import { copyText } from "@ai-matrx/kit/clipboard";
import { downloadFile } from "@/components/agent-copy/export";

/**
 * Download math problem as JSON file
 */
export function downloadMathProblem(problem: Omit<MathProblemProps, "id">, filename?: string) {
    const data = {
        math_problem: problem
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadFile(filename || `${problem.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`, blob, blob.type);
}

/**
 * Upload/import math problem from JSON file
 */
export async function uploadMathProblem(): Promise<Omit<MathProblemProps, "id">> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                reject(new Error("No file selected"));
                return;
            }
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                // Handle both wrapped and unwrapped formats
                let problem;
                if (data.math_problem) {
                    problem = data.math_problem;
                } else if (data.title && data.problem_statement && data.solutions) {
                    problem = data;
                } else {
                    reject(new Error("Invalid math problem format"));
                    return;
                }
                
                resolve(problem);
            } catch (error) {
                reject(error);
            }
        };
        
        input.click();
    });
}

/**
 * Copy math problem to clipboard as JSON
 */
export async function copyMathProblemToClipboard(problem: Omit<MathProblemProps, "id">): Promise<void> {
    const data = {
        math_problem: problem
    };
    
    const json = JSON.stringify(data, null, 2);
    if (!(await copyText(json))) throw new Error("Could not copy the math problem to the clipboard");
}

/**
 * Paste math problem from clipboard
 */
export async function pasteMathProblemFromClipboard(): Promise<Omit<MathProblemProps, "id">> {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);
    
    // Handle both wrapped and unwrapped formats
    if (data.math_problem) {
        return data.math_problem;
    } else if (data.title && data.problem_statement && data.solutions) {
        return data;
    } else {
        throw new Error("Invalid math problem format in clipboard");
    }
}

