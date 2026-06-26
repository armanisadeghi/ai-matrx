/**
 * Complete Execution Thunk
 *
 * Finalizes an execution when streaming completes:
 * 1. Adds assistant message to conversation
 * 2. Completes task in ai_tasks table
 * 3. Adds message to ai_runs table
 * 4. Updates instance state with final stats
 *
 * NOTE: Uses instance.messages directly (not nested in conversation)
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "../../store";
import type { CompleteExecutionPayload, ConversationMessage } from "../types";
import {
  selectInstance,
  addMessage,
  completeExecution,
  setInstanceStatus,
} from "../slice";
import { createClient } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";

export const completeExecutionThunk = createAsyncThunk<
  void,
  CompleteExecutionPayload & {
    responseText: string;
    timeToFirstToken?: number;
    totalTime: number;
  },
  {
    dispatch: AppDispatch;
    state: RootState;
  }
>(
  "promptExecution/completeExecution",
  async (payload, { dispatch, getState }) => {
    const { runId, responseText, timeToFirstToken, totalTime } = payload;

    try {
      const state = getState();
      const instance = selectInstance(state, runId);

      if (!instance) {
        throw new Error(`Instance not found: ${runId}`);
      }

      // Calculate stats
      const tokenCount = Math.round(responseText.length / 4);
      const stats = {
        timeToFirstToken,
        totalTime,
        tokens: tokenCount,
        cost: 0, // Server calculates actual cost
      };

      // Add assistant message to conversation
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: responseText,
        taskId: instance.execution.currentTaskId || undefined,
        timestamp: new Date().toISOString(),
        metadata: stats,
      };

      dispatch(addMessage({ runId, message: assistantMessage }));

      // Complete task in database if tracking
      if (
        instance.runTracking.savedToDatabase &&
        instance.execution.currentTaskId
      ) {
        try {
          // Create fresh client to pick up current auth session
          const supabase = createClient();

          // Complete task
          const { error: taskError } = await fromDeprecatedTable(
            "ai_tasks",
            "lib/redux/prompt-execution/thunks/completeExecutionThunk.ts:completeExecution",
          )
            .update({
              response_text: responseText,
              tokens_total: tokenCount,
              time_to_first_token: timeToFirstToken,
              total_time: totalTime,
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("task_id", instance.execution.currentTaskId);

          if (taskError) {
            console.error("Error completing task:", taskError);
          }

          // Add assistant message to run
          // Note: instance.messages is the direct array now, not nested
          const { error: updateError } = await supabase
            .from("ai_runs")
            .update({
              messages: [...instance.messages, assistantMessage],
            })
            .eq("id", runId);

          if (updateError) {
            console.error("Error updating run messages:", updateError);
          }

          console.log("✅ Execution completed:", {
            runId,
            taskId: instance.execution.currentTaskId,
            tokens: tokenCount,
          });
        } catch (err) {
          console.error("❌ Error saving to database:", err);
        }
      }

      // Update instance state
      // Note: completeExecution action updates updatedAt since execution is complete
      dispatch(completeExecution({ runId, stats }));
    } catch (error) {
      console.error("❌ Failed to complete execution:", error);

      dispatch(
        setInstanceStatus({
          runId,
          status: "error",
          error: error instanceof Error ? error.message : "Completion failed",
        }),
      );

      throw error;
    }
  },
);
