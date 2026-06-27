import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from '../../store';
import { selectPrimaryResponseTextByTaskId } from '../../socket-io/selectors/socket-response-selectors';
import { addMessage, completeExecution, setInstanceStatus } from '../slice';
import { selectInstance, selectDynamicContexts, selectHasDynamicContexts } from '../selectors';
import { createClient } from '@/utils/supabase/client';
import { detectAndUpdateContextsFromResponse } from './detectContextUpdatesThunk';
import { graveyardDb } from "@/utils/supabase/graveyardDb";

interface FinalizeExecutionPayload {
    runId: string;
    taskId: string;
}

export const finalizeExecution = createAsyncThunk<
    void,
    FinalizeExecutionPayload,
    {
        dispatch: AppDispatch;
        state: RootState;
    }
>(
    'promptExecution/finalizeExecution',
    async ({ runId, taskId }, { dispatch, getState }) => {
        const state = getState();

        // 1. Get the final text from the socket response slice
        const finalText = selectPrimaryResponseTextByTaskId(taskId)(state);

        if (!finalText) {
            console.warn(`No final text found for task ${taskId}`);
            // Even if empty, we should probably finish the state to avoid sticking in 'executing'
        }

        // 2. Auto-detect context updates from AI response (if enabled and contexts exist)
        const hasContexts = selectHasDynamicContexts(state, runId);
        if (hasContexts && finalText) {
            try {
                await dispatch(detectAndUpdateContextsFromResponse({
                    runId,
                    responseContent: finalText,
                    autoUpdateEnabled: true, // Could make this configurable via execution config
                })).unwrap();
            } catch (error) {
                console.warn('Context auto-detection failed:', error);
                // Continue with finalization even if context detection fails
            }
        }

        // 3. Add the Assistant Message to Redux
        // This updates the instance.messages array, restoring conversation history
        dispatch(addMessage({
            runId,
            message: {
                role: 'assistant',
                content: finalText || '',
                taskId,
                timestamp: new Date().toISOString(),
                metadata: {
                    // We could fetch stats here if needed
                }
            }
        }));

        // 4. Update the Run in the Database
        const instance = selectInstance(state, runId);
        if (instance && instance.runTracking.savedToDatabase) {
            const supabase = createClient();

            // Get fresh state (after context detection and message addition)
            const freshState = getState();
            const freshInstance = selectInstance(freshState, runId);
            const dynamicContexts = selectDynamicContexts(freshState, runId);

            if (freshInstance) {
                const updateData: Record<string, any> = {
                    messages: freshInstance.messages, // Update with full history
                    status: 'active', // Keep active
                };

                // Include dynamic contexts if they exist
                if (Object.keys(dynamicContexts).length > 0) {
                    updateData.dynamic_contexts = dynamicContexts;
                }

                const { error } = await graveyardDb(supabase)
                    .from("ai_runs")
                    .update(updateData)
                    .eq('id', runId);

                if (error) {
                    console.error('Failed to update run in DB:', error);
                }
            }
        }

        // 5. Complete execution - THIS CLEARS currentTaskId to prevent duplicate finalization
        // completeExecution clears taskId and sets status to 'completed'
        dispatch(completeExecution({ runId, stats: {} }));
        
        // 6. Set status back to 'ready' for chat continuation
        dispatch(setInstanceStatus({ runId, status: 'ready' }));

        console.log('✅ Execution finalized for run:', runId);
    }
);
