/**
 * Setup Programmatic Execution Thunk
 * 
 * Unified thunk for setting up a complete execution context programmatically.
 * 
 * This is the RECOMMENDED way to execute prompts programmatically with full control:
 * - Creates execution instance
 * - Sets all variables
 * - Sets all resources
 * - Sets initial input
 * - Returns runId for further operations
 * 
 * Use this when you need complete control over the execution state before starting.
 * For simpler cases, use startPromptInstance directly.
 * 
 * @example
 * ```typescript
 * const runId = await dispatch(setupProgrammaticExecution({
 *   promptId: 'text-analyzer',
 *   promptSource: 'prompts',
 *   executionConfig: {
 *     auto_run: false,
 *     allow_chat: true,
 *     show_variables: false,
 *     apply_variables: true,
 *     track_in_runs: true,
 *     use_pre_execution_input: false,
 *   },
 *   variables: { text: selectedText, format: 'markdown' },
 *   resources: [
 *     { type: 'url', url: 'https://example.com/doc.pdf' },
 *     { type: 'image', url: 'https://example.com/image.png' }
 *   ],
 *   initialMessage: 'Analyze this document'
 * })).unwrap();
 * 
 * // Now execute the prompt
 * await dispatch(executeMessage({ runId }));
 * ```
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from '../../store';
import type { Resource } from '@/features/agents/resources/types';
import type { ExecutionConfig } from '../types';
import { startPromptInstance } from './startInstanceThunk';

export interface SetupProgrammaticExecutionPayload {
  /** Prompt identifier */
  promptId: string;
  
  /** Source table ('prompts' or 'prompt_builtins') */
  promptSource?: 'prompts' | 'prompt_builtins';
  
  /** Execution configuration (all properties required) */
  executionConfig: ExecutionConfig;
  
  /** Variable values to pre-populate */
  variables?: Record<string, string>;
  
  /** Resources to attach (files, images, URLs, etc.) */
  resources?: Resource[];
  
  /** Initial message in the input field */
  initialMessage?: string;
  
  /** Optional runId (defaults to auto-generated) */
  runId?: string;
}

/**
 * Set up a complete programmatic execution context
 * 
 * This thunk creates a fully configured execution instance with:
 * - All variables set
 * - All resources attached
 * - Initial message populated
 * - Ready for execution
 * 
 * Returns the runId which can be used to:
 * - Execute the prompt via executeMessage
 * - Open different display types
 * - Monitor execution state
 */
export const setupProgrammaticExecution = createAsyncThunk<
  string, // Returns runId
  SetupProgrammaticExecutionPayload,
  {
    dispatch: AppDispatch;
    state: RootState;
  }
>(
  'promptExecution/setupProgrammatic',
  async (payload, { dispatch }) => {
    const {
      promptId,
      promptSource = 'prompts',
      executionConfig,
      variables = {},
      resources = [],
      initialMessage = '',
      runId: providedRunId,
    } = payload;

    console.log('🔧 Setting up programmatic execution:', {
      promptId,
      promptSource,
      variablesCount: Object.keys(variables).length,
      resourcesCount: resources.length,
      hasInitialMessage: !!initialMessage,
      providedRunId,
    });

    // ========== STEP 1: Create Execution Instance ==========
    // startPromptInstance now handles resources internally
    const runId = await dispatch(startPromptInstance({
      promptId,
      promptSource,
      executionConfig,
      variables,
      resources, // Now supported!
      initialMessage,
      runId: providedRunId,
    })).unwrap();

    console.log('✅ Programmatic execution setup complete:', {
      runId,
      promptId,
      ready: true,
    });

    return runId;
  }
);

