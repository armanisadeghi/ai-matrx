/**
 * Message Builder Utility
 * 
 * SINGLE SOURCE OF TRUTH for message construction.
 * Centralizes ALL logic for building messages that will be sent to the model.
 * This ensures debug components show EXACTLY what will be sent.
 * 
 * Both executeMessageThunk and debug components MUST use this.
 */

import type { Resource } from '@/features/agents/resources/types';
import type { ConversationMessage } from '../types';
import type { DynamicContextsMap } from '../types/dynamic-context';
import { replaceVariablesInText } from '@/features/prompts/utils/variable-resolver';
import { fetchResourcesData } from '@/features/prompts/utils/resource-data-fetcher';
import { formatResourcesToXml, appendResourcesToMessage } from '@/features/agents/resources/utils';
import {
  buildContextSection,
  hasContextXml,
  extractContextsFromXml,
  removeContextsFromContent,
  createContextArchiveMetadata,
} from './context-formatter';

// ========================================
// NEW: Centralized Message Processing
// ========================================

export interface ProcessMessagesOptions {
  /**
   * The template messages (may contain variables to be replaced)
   */
  templateMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  
  /**
   * Is this the first execution? (requires variable replacement in templates)
   */
  isFirstExecution: boolean;
  
  /**
   * The user's additional input/message
   */
  userInput: string;
  
  /**
   * Resources to attach to the final user message
   */
  resources: Resource[];
  
  /**
   * Variables to replace in messages
   */
  variables: Record<string, string>;
  
  /**
   * Dynamic contexts to inject into the final message
   */
  dynamicContexts?: DynamicContextsMap;
}

export interface ProcessMessagesResult {
  /**
   * The complete processed messages array ready to send to the model
   */
  messages: ConversationMessage[];
  
  /**
   * Debug info: The final user message content
   */
  finalUserMessageContent: string;
  
  /**
   * Debug info: Base content before resources
   */
  baseContent: string;
  
  /**
   * Debug info: Formatted resources XML
   */
  resourcesXml: string;
  
  /**
   * Debug info: Whether resources were included
   */
  hasResources: boolean;
}

/**
 * Process messages for execution - CENTRALIZED LOGIC
 * 
 * This function handles the complete message processing pipeline:
 * 1. First execution: Apply variables to template messages
 * 2. Determine if last template message is user message
 * 3. Fetch and format resources
 * 4. Combine template + user input (if needed) OR just use input
 * 5. Append resources to final user message
 * 6. Replace variables in final message
 * 7. Return complete messages array with timestamps
 * 
 * @param options - Message processing options
 * @returns Complete processed messages array ready to send
 */
export async function processMessagesForExecution(
  options: ProcessMessagesOptions
): Promise<ProcessMessagesResult> {
  const {
    templateMessages,
    isFirstExecution,
    userInput,
    resources,
    variables,
    dynamicContexts = {},
  } = options;
   
  const timestamp = new Date().toISOString();
  
  // ========== STEP 1: Process Template Messages ==========
  let processedMessages: ConversationMessage[] = [];
  
  if (isFirstExecution) {
    // Apply variables to all template messages
    processedMessages = templateMessages.map(msg => ({
      role: msg.role,
      content: replaceVariablesInText(msg.content, variables),
      timestamp,
      metadata: (msg as any).metadata, // Preserve existing metadata (including fromTemplate)
    }));
  } else {
    // Not first execution - no template processing needed
    // We'll just add the new user message
    processedMessages = [];
  }
  
  // ========== STEP 2: Build Final User Message ==========
  const lastMsg = processedMessages[processedMessages.length - 1];
  const isLastTemplateMessageUser = lastMsg?.role === 'user';
  
  // Build the base content
  let baseContent: string;
  
  if (isFirstExecution && isLastTemplateMessageUser && lastMsg) {
    // Combine template's last user message with additional input
    baseContent = userInput.trim()
      ? `${lastMsg.content}\n\n${userInput}`
      : lastMsg.content;
  } else {
    // Just use the user input
    baseContent = userInput;
  }
  
  // ========== Handle Empty User Input ==========
  // If no base content and we're on first execution with template messages,
  // the template messages are sufficient - return them as-is
  if (!baseContent.trim()) {
    if (isFirstExecution && processedMessages.length > 0) {
      // Template messages exist - they're self-contained, no additional user message needed
      // Still process resources/contexts and attach to the last message if applicable
      const lastMessage = processedMessages[processedMessages.length - 1];
      
      // Fetch resources if provided
      let resourcesXml = '';
      const hasResources = resources.length > 0;
      if (hasResources && lastMessage) {
        const enrichedResources = await fetchResourcesData(resources);
        resourcesXml = formatResourcesToXml(enrichedResources);
        lastMessage.content = appendResourcesToMessage(lastMessage.content, resourcesXml);
      }
      
      // Add dynamic contexts to last message if applicable
      const contextsXml = buildContextSection(dynamicContexts);
      if (contextsXml && lastMessage) {
        lastMessage.content = `${lastMessage.content}${contextsXml}`;
      }
      
      return {
        messages: processedMessages,
        finalUserMessageContent: lastMessage?.content || '',
        baseContent: '',
        resourcesXml,
        hasResources,
      };
    }
    
    throw new Error('No message content to build');
  }
  
  // ========== STEP 3: Build Dynamic Contexts XML ==========
  const contextsXml = buildContextSection(dynamicContexts);
  const hasContexts = Object.keys(dynamicContexts).length > 0;
  
  // ========== STEP 4: Fetch and Format Resources ==========
  let resourcesXml = '';
  const hasResources = resources.length > 0;
  
  if (hasResources) {
    const enrichedResources = await fetchResourcesData(resources);
    resourcesXml = formatResourcesToXml(enrichedResources);
  }
  
  // ========== STEP 5: Combine Base Content + Contexts + Resources ==========
  let messageWithAdditions = baseContent;
  
  // Add contexts first (they're the primary focus for iteration)
  if (contextsXml) {
    messageWithAdditions = `${messageWithAdditions}${contextsXml}`;
  }
  
  // Then add resources
  if (resourcesXml) {
    messageWithAdditions = appendResourcesToMessage(messageWithAdditions, resourcesXml);
  }
  
  // ========== STEP 6: Replace Variables in Final Message ==========
  const finalUserMessageContent = replaceVariablesInText(
    messageWithAdditions,
    variables
  );
  
  // ========== STEP 7: Archive Contexts in Previous Messages ==========
  // For all messages except the last one, move context XML from content to metadata
  if (hasContexts) {
    const archiveMetadata = createContextArchiveMetadata(dynamicContexts);
    
    processedMessages.forEach((msg, idx) => {
      // Skip the last message (which will be the current one with latest contexts)
      if (idx < processedMessages.length - 1 && hasContextXml(msg.content)) {
        // Remove context XML from content
        msg.content = removeContextsFromContent(msg.content);
        
        // Add to metadata
        if (!msg.metadata) {
          msg.metadata = {};
        }
        msg.metadata.archivedContexts = archiveMetadata;
      }
    });
  }
  
  // ========== STEP 8: Update or Add Final User Message ==========
  if (isFirstExecution && isLastTemplateMessageUser && lastMsg) {
    // Replace the last template message with our combined message
    // Preserve existing metadata (including fromTemplate marker)
    lastMsg.content = finalUserMessageContent;
    // metadata already preserved from step 1
  } else {
    // Add new user message (NOT from template)
    processedMessages.push({
      role: 'user',
      content: finalUserMessageContent,
      timestamp,
      // No fromTemplate marker for user-created messages
    });
  }
  
  return {
    messages: processedMessages,
    finalUserMessageContent,
    baseContent,
    resourcesXml,
    hasResources,
  };
}

// ========================================
// LEGACY: Kept for backwards compatibility
// ========================================

export interface BuildMessageOptions {
  /**
   * Mode 1: Is this the first message with a template?
   * If true, we'll combine template + user input
   */
  isFirstMessage: boolean;
  
  /**
   * Mode 1: Is the last template message from the user?
   * If true, we replace it with our combined message
   */
  isLastTemplateMessageUser: boolean;
  
  /**
   * The last message from the conversation template (if in Mode 1)
   * Note: Template messages may not have timestamps
   */
  lastTemplateMessage?: { role: 'user' | 'assistant' | 'system'; content: string };
  
  /**
   * The user's additional input/message
   */
  userInput: string;
  
  /**
   * Resources to attach to the message
   */
  resources: Resource[];
  
  /**
   * Variables to replace in the message
   */
  variables: Record<string, string>;
}

export interface BuildMessageResult {
  /**
   * The final message content with variables replaced and resources appended
   */
  finalContent: string;
  
  /**
   * The base message before resources were added (for debugging)
   */
  baseContent: string;
  
  /**
   * The formatted resources XML (for debugging)
   */
  resourcesXml: string;
  
  /**
   * Whether resources were included
   */
  hasResources: boolean;
}

/**
 * Build the final message content that will be sent to the model
 * 
 * This function handles:
 * 1. Combining template + user input (Mode 1) OR just user input (Mode 2)
 * 2. Fetching and formatting resources
 * 3. Appending resources to message
 * 4. Replacing variables in the complete message
 * 
 * @param options - Message building options
 * @returns The final message content and metadata
 */
export async function buildFinalMessage(
  options: BuildMessageOptions
): Promise<BuildMessageResult> {
  const {
    isFirstMessage,
    isLastTemplateMessageUser,
    lastTemplateMessage,
    userInput,
    resources,
    variables,
  } = options;
  
  // ========== STEP 1: Build Base Message Content ==========
  let baseContent: string;
  
  if (isFirstMessage && isLastTemplateMessageUser && lastTemplateMessage) {
    // Mode 1: First message with template
    // Combine template with user input
    const templateContent = lastTemplateMessage.content;
    
    baseContent = userInput.trim()
      ? `${templateContent}\n\n${userInput}`
      : templateContent;
  } else {
    // Mode 2: Direct chat (subsequent messages)
    // Just use input
    baseContent = userInput;
  }
  
  if (!baseContent.trim()) {
    throw new Error('No message content to build');
  }
  
  // ========== STEP 2: Fetch and Format Resources ==========
  let resourcesXml = '';
  const hasResources = resources.length > 0;
  
  if (hasResources) {
    // Fetch data for resources that need it (e.g., tables)
    const enrichedResources = await fetchResourcesData(resources);
    
    // Format to XML
    resourcesXml = formatResourcesToXml(enrichedResources);
  }
  
  // ========== STEP 3: Append Resources to Message ==========
  const messageWithResources = appendResourcesToMessage(
    baseContent,
    resourcesXml
  );
  
  // ========== STEP 4: Replace Variables ==========
  // Replace variables in the COMPLETE message (template + input + resources)
  const finalContent = replaceVariablesInText(
    messageWithResources,
    variables
  );
  
  return {
    finalContent,
    baseContent,
    resourcesXml,
    hasResources,
  };
}

