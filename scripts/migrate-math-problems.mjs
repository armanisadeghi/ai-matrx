/**
 * Migration Script: Push Math Problems to Database (ESM Version)
 * 
 * Usage: node scripts/migrate-math-problems.mjs
 * 
 * This script reads the sample math problems data and inserts it into the
 * Supabase database. Run this once to populate the database with initial data.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// Read and parse the sample data file
const sampleDataPath = resolve(__dirname, '../app/(authenticated)/tests/math/local-data/sample-data.ts');
const sampleDataContent = readFileSync(sampleDataPath, 'utf-8');

// Extract the problemsData array using a simple approach
// This is a workaround since we can't directly import .ts files in .mjs
const problemsDataMatch = sampleDataContent.match(/export const problemsData.*?=\s*(\[[\s\S]*?\]);/);

if (!problemsDataMatch) {
    console.error('❌ Could not extract problemsData from sample-data.ts');
    process.exit(1);
}

// Use dynamic evaluation (only safe because this is our own controlled data)
const problemsData = eval(problemsDataMatch[1]);

// API keys: ONLY sb_secret_*. The legacy JWT-based SUPABASE_SERVICE_ROLE_KEY
// is DEPRECATED and BANNED in this repo — ESLint will block it.
// Docs: https://supabase.com/docs/guides/getting-started/api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
    console.error('   - SUPABASE_SECRET_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Transform local data format to database format
 */
function transformProblemForDatabase(problem) {
    return {
        id: problem.id,
        title: problem.title,
        course_name: problem.courseName,
        topic_name: problem.topicName,
        module_name: problem.moduleName,
        description: problem.description,
        intro_text: problem.introText,
        final_statement: problem.finalStatement,
        problem_statement: {
            text: problem.problemStatement.text,
            equation: problem.problemStatement.equation,
            instruction: problem.problemStatement.instruction,
        },
        solutions: problem.solutions.map(solution => ({
            task: solution.task,
            steps: solution.steps.map(step => ({
                title: step.title,
                equation: step.equation,
                explanation: step.explanation,
                simplified: step.simplified,
            })),
            solutionAnswer: solution.solutionAnswer,
            transitionText: solution.transitionText,
        })),
        hint: problem.hint || null,
        resources: problem.resources || null,
        difficulty_level: problem.difficultyLevel || null,
        related_content: problem.relatedContent || null,
        sort_order: 0,
        is_published: true,
        created_by: null,
    };
}

/**
 * Main migration function
 */
async function migrateMathProblems() {
    console.log('🚀 Starting math problems migration...\n');
    console.log(`📊 Total problems to migrate: ${problemsData.length}\n`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < problemsData.length; i++) {
        const problem = problemsData[i];
        const progress = `[${i + 1}/${problemsData.length}]`;
        
        try {
            const transformedProblem = transformProblemForDatabase(problem);
            
            // Check if problem already exists
            const { data: existing } = await supabase
                .from('math_problems')
                .select('id')
                .eq('id', problem.id)
                .single();
            
            if (existing) {
                // Update existing problem
                const { error } = await supabase
                    .from('math_problems')
                    .update(transformedProblem)
                    .eq('id', problem.id);
                
                if (error) throw error;
                console.log(`${progress} ✅ Updated: ${problem.title}`);
            } else {
                // Insert new problem
                const { error } = await supabase
                    .from('math_problems')
                    .insert(transformedProblem);
                
                if (error) throw error;
                console.log(`${progress} ✅ Inserted: ${problem.title}`);
            }
            
            successCount++;
        } catch (error) {
            errorCount++;
            const errorMessage = error?.message || String(error);
            errors.push({
                id: problem.id,
                title: problem.title,
                error: errorMessage,
            });
            console.error(`${progress} ❌ Failed: ${problem.title}`);
            console.error(`   Error: ${errorMessage}\n`);
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📊 Total: ${problemsData.length}`);
    console.log('='.repeat(60) + '\n');
    
    if (errors.length > 0) {
        console.log('❌ Errors encountered:\n');
        errors.forEach(({ id, title, error }) => {
            console.log(`   ID: ${id}`);
            console.log(`   Title: ${title}`);
            console.log(`   Error: ${error}\n`);
        });
    }
    
    if (errorCount === 0) {
        console.log('🎉 Migration completed successfully!\n');
        console.log('✨ You can now access the problems at: /education/math\n');
    } else {
        console.log('⚠️  Migration completed with errors. Please review the errors above.\n');
        process.exit(1);
    }
}

// Run the migration
migrateMathProblems()
    .then(() => {
        console.log('✅ Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Migration script failed:', error);
        process.exit(1);
    });

