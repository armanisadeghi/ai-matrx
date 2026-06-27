/**
 * API Payload Builder Utility
 * 
 * SINGLE SOURCE OF TRUTH for what gets sent to the API.
 * This utility uses the EXACT same centralized logic as executeMessageThunk.
 * 
 * Used by:
 * 1. Debug panel - to show accurate preview
 * 2. Any other debugging/logging tools
 * 
 * CRITICAL: This must match executeMessageThunk.ts logic exactly.
 */

import type { ConversationMessage } from '../types';
import type { Resource } from '@/features/agents/resources/types';
import { processMessagesForExecution } from './message-builder';

export interface APIPayloadBuilderOptions {
  /**
   * Current state from Redux
   */
  requiresVariableReplacement: boolean;
  messages: ConversationMessage[];
  currentInput: string;
  resources: Resource[];
  variables: Record<string, string>;
}

export interface APIPayloadResult {
  /**
   * The exact messages array that will be sent to the API
   */
  messages: Array<{ role: string; content: string }>;
  
  /**
   * Whether this is simulating first execution (Mode 1)
   */
  isSimulation: boolean;
  
  /**
   * Error if payload cannot be built
   */
  error?: string;
}

/**
 * Build the EXACT API payload that will be sent
 * 
 * This function uses the SAME centralized logic as executeMessageThunk.
 * No more duplication - everything goes through processMessagesForExecution.
 * 
 * @param options - Current state options
 * @returns The exact API payload with metadata
 */
export async function buildAPIPayload(
  options: APIPayloadBuilderOptions
): Promise<APIPayloadResult> {
  const {
    requiresVariableReplacement,
    messages,
    currentInput,
    resources,
    variables,
  } = options;

  try {
    // Use the EXACT same centralized function as executeMessageThunk
    const result = await processMessagesForExecution({
      templateMessages: messages,
      isFirstExecution: requiresVariableReplacement,
      userInput: currentInput,
      resources,
      variables,
    });

    // Strip timestamps for API payload (API doesn't need them)
    const apiMessages = result.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    return {
      messages: apiMessages,
      isSimulation: requiresVariableReplacement,
    };
  } catch (error) {
    return {
      messages: [],
      isSimulation: requiresVariableReplacement,
      error: error instanceof Error ? error.message : 'Failed to build payload',
    };
  }
}

/**
 * Synchronous version for quick previews (without resources)
 * 
 * NOTE: This is a simplified version that does NOT include resource processing.
 * Use buildAPIPayload() for accurate previews with resources.
 * 
 * This is kept for backwards compatibility with components that don't need resources.
 */
export function buildAPIPayloadSync(
  options: APIPayloadBuilderOptions
): APIPayloadResult {
  const {
    requiresVariableReplacement,
    messages,
    currentInput,
  } = options;

  try {
    // Quick sync version - call the async version with empty resources
    // We can't use the centralized function here (it's async), so we keep simple logic
    
    if (requiresVariableReplacement) {
      // Return templates as-is (no variable replacement in sync version)
      const processedMessages = [...messages];
      
      const lastMsg = processedMessages[processedMessages.length - 1];
      const isLastMessageUser = lastMsg?.role === 'user';

      if (isLastMessageUser && lastMsg && currentInput.trim()) {
        lastMsg.content = `${lastMsg.content}\n\n${currentInput.trim()}`;
      } else if (currentInput.trim()) {
        processedMessages.push({
          role: 'user',
          content: currentInput.trim(),
          timestamp: new Date().toISOString(),
        });
      }

      return {
        messages: processedMessages.map(m => ({ role: m.role, content: m.content })),
        isSimulation: true,
      };
    } else {
      const currentMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      if (currentInput.trim()) {
        currentMessages.push({
          role: 'user',
          content: currentInput.trim(),
        });
      }

      return {
        messages: currentMessages,
        isSimulation: false,
      };
    }
  } catch (error) {
    return {
      messages: [],
      isSimulation: requiresVariableReplacement,
      error: error instanceof Error ? error.message : 'Failed to build payload',
    };
  }
}

