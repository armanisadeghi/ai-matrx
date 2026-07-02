/**
 * Prompt Context Resolver
 * 
 * Resolves variables for system prompts based on:
 * 1. The functionality_id (what the CODE expects)
 * 2. The placement_type (where it's being used)
 * 3. The available UI context
 * 4. Default values defined in the prompt
 */

import { extractVariablesFromPrompt } from '@/lib/services/functionality-helpers';
import type { BasePromptSnapshot } from '@/lib/services/functionality-helpers';

export interface UIContext {
  // Text context
  selection?: string;
  editorContent?: string;
  highlightedText?: string;
  
  // Code context
  currentCode?: string;
  language?: string;
  framework?: string;
  errorMessage?: string;
  
  // Card context
  cardTitle?: string;
  cardDescription?: string;
  cardContext?: string;
  
  // General context
  pageUrl?: string;
  userId?: string;
  topic?: string;
  query?: string;
  
  // Custom
  [key: string]: unknown;
}

interface PromptVariableDefault {
  name: string;
  defaultValue?: unknown;
  customComponent?: unknown;
}

interface PromptSnapshot extends BasePromptSnapshot {
  variables?: string[];
  variableDefaults?: PromptVariableDefault[];
}

export class PromptContextResolver {
  /**
   * Extract variables from prompt snapshot
   */
  static getVariables(promptSnapshot: PromptSnapshot): string[] {
    return extractVariablesFromPrompt(promptSnapshot);
  }

  /**
   * Resolve all variables for a prompt based on functionality and context.
   * Falls back to default values when context doesn't provide them.
   */
  static resolve(
    promptSnapshot: PromptSnapshot,
    functionalityId: string,
    placementType: string,
    uiContext: UIContext
  ): Record<string, unknown> {
    const variables = this.getVariables(promptSnapshot);
    const variableDefaults = promptSnapshot.variableDefaults ?? [];
    const resolved: Record<string, unknown> = {};

    // Create a map of defaults for quick lookup
    const defaultsMap = new Map(
      variableDefaults.map(vd => [vd.name, vd.defaultValue])
    );

    for (const varName of variables) {
      // Try to resolve from UI context first
      const contextValue = this.resolveVariable(varName, functionalityId, placementType, uiContext);
      
      if (contextValue !== undefined && contextValue !== null && contextValue !== '') {
        // Use value from context
        resolved[varName] = contextValue;
      } else if (defaultsMap.has(varName)) {
        // Use default value
        const defaultValue = defaultsMap.get(varName);
        if (defaultValue !== undefined && defaultValue !== null) {
          resolved[varName] = defaultValue;
        }
      }
      // If neither context nor default, variable is simply not included
    }

    return resolved;
  }

  /**
   * Checks if all required variables can be resolved from the UI context OR have defaults.
   * Variables with defaults are always considered resolvable.
   * 
   * @param promptSnapshot - The prompt snapshot
   * @param functionalityId - The functionality ID
   * @param placementType - Where it's being triggered from
   * @param uiContext - The current UI state
   * @returns Object with canResolve boolean and list of missing variables
   */
  static canResolve(
    promptSnapshot: PromptSnapshot,
    functionalityId: string,
    placementType: string,
    uiContext: UIContext
  ): { canResolve: boolean; missingVariables: string[]; resolvedVariables: string[] } {
    const variables = this.getVariables(promptSnapshot);
    const variableDefaults = promptSnapshot.variableDefaults ?? [];
    
    // Create a map of variables with defaults for quick lookup
    const defaultsMap = new Map(
      variableDefaults.map(vd => [vd.name, vd.defaultValue])
    );

    const resolved: string[] = [];
    const missing: string[] = [];

    for (const varName of variables) {
      // Check if variable has a default value
      const hasDefault = defaultsMap.has(varName);
      const defaultValue = defaultsMap.get(varName);
      
      // Try to resolve from UI context
      const value = this.resolveVariable(varName, functionalityId, placementType, uiContext);
      
      if (value !== undefined && value !== null && value !== '') {
        // Successfully resolved from context
        resolved.push(varName);
      } else if (hasDefault && defaultValue !== undefined && defaultValue !== null) {
        // Has a default value - this is OK, will use default
        resolved.push(varName);
      } else {
        // No value from context AND no default - this is missing
        missing.push(varName);
      }
    }

    return {
      canResolve: missing.length === 0,
      missingVariables: missing,
      resolvedVariables: resolved,
    };
  }

  /**
   * Resolve a single variable based on functionality
   */
  private static resolveVariable(
    varName: string,
    functionalityId: string,
    placementType: string,
    uiContext: UIContext
  ): unknown {
    // Functionality-specific resolution
    switch (functionalityId) {
      // ===== CONTENT CARDS =====
      case 'content-expander-card':
        if (varName === 'title') return uiContext.cardTitle;
        if (varName === 'description') return uiContext.cardDescription;
        if (varName === 'context') return uiContext.cardContext;
        break;

      // ===== TEXT OPERATIONS =====
      case 'explain-text':
        if (varName === 'content_to_explain') {
          return uiContext.selection || uiContext.highlightedText || uiContext.editorContent;
        }
        if (varName === 'context') return uiContext.editorContent;
        break;

      case 'summarize-text':
      case 'improve-writing':
      case 'extract-key-points':
        if (varName === 'text') {
          return uiContext.selection || uiContext.highlightedText || uiContext.editorContent;
        }
        if (varName === 'output_format') return uiContext.output_format;
        if (varName === 'style') return uiContext.style || 'concise';
        break;

      case 'translate-text':
        if (varName === 'text') {
          return uiContext.selection || uiContext.highlightedText || uiContext.editorContent;
        }
        if (varName === 'target_language') return uiContext.targetLanguage || uiContext.target_language;
        if (varName === 'source_language') return uiContext.sourceLanguage || uiContext.source_language;
        break;

      // ===== CODE OPERATIONS =====
      case 'analyze-code':
      case 'fix-code':
      case 'refactor-code':
        if (varName === 'current_code' || varName === 'code') {
          return uiContext.currentCode || uiContext.selection || uiContext.code;
        }
        if (varName === 'language') return uiContext.language;
        if (varName === 'framework') return uiContext.framework;
        if (varName === 'error_message') return uiContext.errorMessage || uiContext.error_message;
        break;

      // ===== CONTENT GENERATION =====
      case 'generate-content':
      case 'get-ideas':
        if (varName === 'topic') {
          return uiContext.topic || uiContext.selection || uiContext.query;
        }
        if (varName === 'topic_or_data') {
          return uiContext.topic || uiContext.selection || uiContext.query || uiContext.editorContent;
        }
        if (varName === 'tone') return uiContext.tone;
        if (varName === 'length') return uiContext.length;
        if (varName === 'style') return uiContext.style;
        if (varName === 'audience') return uiContext.audience;
        if (varName === 'creativity_level') return uiContext.creativity_level;
        if (varName === 'idea_count') return uiContext.idea_count;
        break;

      case 'create-flashcards':
      case 'create-quiz':
        if (varName === 'content') {
          return uiContext.selection || uiContext.editorContent || uiContext.content;
        }
        if (varName === 'topic_or_data') {
          return uiContext.topic || uiContext.selection || uiContext.editorContent;
        }
        if (varName === 'difficulty') return uiContext.difficulty;
        if (varName === 'question_count' || varName === 'count') {
          return uiContext.questionCount || uiContext.question_count || uiContext.count;
        }
        break;

      // ===== UTILITIES =====
      case 'search-web':
        if (varName === 'query') {
          return uiContext.query || uiContext.selection || uiContext.topic;
        }
        break;

      // ===== CUSTOM =====
      case 'custom':
        // Try direct match first
        if (uiContext[varName] !== undefined) {
          return uiContext[varName];
        }
        // Common fallbacks
        if (varName === 'text' || varName === 'content' || varName === 'selected_text') {
          return uiContext.selection || uiContext.editorContent || uiContext.text || uiContext.content;
        }
        if (varName === 'code' || varName === 'current_code') {
          return uiContext.currentCode || uiContext.code;
        }
        break;
    }

    // Direct match fallback
    if (uiContext[varName] !== undefined) {
      return uiContext[varName];
    }

    // Common variable name fallbacks
    if (varName === 'text' || varName === 'content' || varName === 'selected_text') {
      return uiContext.selection || uiContext.editorContent;
    }
    if (varName === 'code' || varName === 'current_code') {
      return uiContext.currentCode || uiContext.selection;
    }

    // Return undefined if can't resolve
    return undefined;
  }
}
