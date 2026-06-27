import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from '../../store';
import { createClient } from '@/utils/supabase/client';
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
    createInstance,
    addMessage,
    updateVariables,
    setRunId,
    setInstanceStatus,
    setDynamicContexts
} from '../slice';
import type { ExecutionInstance, ConversationMessage } from '../types';
import { getPrompt } from '../../thunks/promptSystemThunks';

interface LoadRunPayload {
    runId: string;
    forceRefresh?: boolean;
}

export const loadRun = createAsyncThunk<
    void,
    LoadRunPayload,
    {
        dispatch: AppDispatch;
        state: RootState;
    }
>(
    'promptExecution/loadRun',
    async ({ runId, forceRefresh = false }, { dispatch, getState }) => {
        const state = getState();

        // Check if run already exists in state
        const existingInstance = state.promptExecution.instances[runId];
        if (existingInstance && !forceRefresh) {
            // Already loaded, no need to re-fetch unless forced
            return;
        }

        try {
            const supabase = createClient();

            // Fetch run from database
            const { data: run, error } = await graveyardDb(supabase)
                .from("ai_runs")
                .select('*')
                .eq('id', runId)
                .single();

            if (error || !run) {
                throw new Error(error?.message || `Run not found: ${runId}`);
            }

            // Fetch prompt data to get defaults and settings if needed (cache-first)
            // We use the source_id from the run to fetch the prompt
            let fetchedPromptData: any = null;
            if (run.source_id) {
                const validSource = (run.source_type === 'prompts' || run.source_type === 'prompt_builtins')
                    ? run.source_type
                    : 'prompts';

                try {
                    const { promptData } = await dispatch(
                        getPrompt({
                            promptId: run.source_id,
                            source: validSource,
                            allowStale: true // Allow stale for historical runs
                        })
                    ).unwrap();
                    fetchedPromptData = promptData;
                } catch (error) {
                    console.warn(`Failed to fetch prompt ${run.source_id} for run ${runId}:`, error);
                    // Continue without prompt data - use run's stored settings
                }
            }

            // Prepare instance data
            const now = Date.now();

            // Ensure promptSource is valid type ('prompts' or 'prompt_builtins')
            const validSource = (run.source_type === 'prompts' || run.source_type === 'prompt_builtins')
                ? run.source_type
                : 'prompts'; // Default fallback

            const instance: ExecutionInstance = {
                runId: run.id,
                promptName: run.name || 'Unknown Prompt',
                promptId: run.source_id || 'unknown',
                promptSource: validSource,
                status: 'ready', // Or 'completed' if run is done? For now 'ready' allows continuing
                error: null,
                createdAt: new Date(run.created_at).getTime(),
                updatedAt: now,

                // Use settings from run, fallback to prompt settings
                settings: run.settings || (fetchedPromptData?.settings as any) || {},

                executionConfig: {
                    auto_run: false, // Don't auto-run loaded historical runs
                    allow_chat: true,
                    show_variables: false,
                    apply_variables: true,
                    track_in_runs: true,
                    use_pre_execution_input: false,
                },

                variables: {
                    userValues:
                        run.variable_values && typeof run.variable_values === 'object' && !Array.isArray(run.variable_values)
                            ? (run.variable_values as Record<string, string>)
                            : {},
                    scopedValues: {},
                    computedValues: {},
                },
                variableDefaults: fetchedPromptData?.variableDefaults || [],

                messages: [], // Will be populated below

                // Loaded runs have already been processed - no variable replacement needed
                requiresVariableReplacement: false,

                execution: {
                    currentTaskId: null,
                    messageStartTime: null,
                    timeToFirstToken: undefined,
                    lastMessageStats: null,
                },

                runTracking: {
                    sourceType: validSource, // Use same validated source
                    sourceId: run.source_id || 'unknown',
                    runName: run.name,
                    totalTokens: 0, // Could calculate from messages if needed
                    totalCost: 0,
                    savedToDatabase: true,
                },
            };

            // Initialize instance
            dispatch(createInstance(instance));

            // Add messages
            if (run.messages && Array.isArray(run.messages)) {
                run.messages.forEach((msg: any) => {
                    const message: ConversationMessage = {
                        role: msg.role,
                        content: msg.content,
                        taskId: msg.taskId,
                        timestamp: msg.timestamp || new Date().toISOString(),
                        metadata: msg.metadata,
                    };
                    dispatch(addMessage({ runId, message }));
                });
            }

            // Restore dynamic contexts if they were saved
            if (run.dynamic_contexts && typeof run.dynamic_contexts === 'object' && !Array.isArray(run.dynamic_contexts)) {
                const contexts = run.dynamic_contexts as import('../types/dynamic-context').DynamicContextsMap;
                dispatch(setDynamicContexts({
                    runId,
                    contexts
                }));
                console.log('✅ Dynamic contexts restored:', Object.keys(contexts));
            }

            // Set run ID tracking
            dispatch(setRunId({
                runId,
                runName: run.name,
                savedToDatabase: true
            }));

            console.log('✅ Run loaded:', runId);

        } catch (error) {
            console.error('❌ Failed to load run:', error);
            // We might want to set an error state on a placeholder instance if it fails
            // But for now just log
            throw error;
        }
    }
);
