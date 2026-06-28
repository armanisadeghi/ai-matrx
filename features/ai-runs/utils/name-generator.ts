/**
 * Auto-generate meaningful names for AI runs based on content
 */

/**
 * Generate a run name from variable values (no keys, just values)
 * Example: "John Doe, Product Launch" instead of "Name: John Doe, Project: Product Launch"
 */
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * Generate a run name from variable values (no keys, just values)
 * Example: "John Doe, Product Launch" instead of "Name: John Doe, Project: Product Launch"
 * 
 * PRIORITIZATION:
 * 1. Variables with 'textarea' component or NO component (likely text input)
 * 2. Other changed variables
 */
export function generateRunNameFromVariables(
  variableValues: Record<string, string>,
  variableDefaults?: VariableDefinition[]
): string | null {
  if (!variableValues || Object.keys(variableValues).length === 0) {
    return null;
  }

  // Create a map of defaults for easy lookup
  const defaultsMap = variableDefaults?.reduce((acc, v) => {
    acc[v.name] = v;
    return acc;
  }, {} as Record<string, VariableDefinition>) || {};

  const entries = Object.entries(variableValues);

  // Filter for variables that have changed from their default value
  const changedEntries = entries.filter(([key, value]) => {
    const defaultVal = defaultsMap[key]?.defaultValue;
    return defaultVal !== value;
  });

  if (changedEntries.length === 0) {
    return null;
  }

  // Find "text-like" variables (textarea or no component specified)
  // These are most likely to contain custom, meaningful text
  const textLikeEntries = changedEntries.filter(([key]) => {
    const def = defaultsMap[key];
    // If no definition, assume it's text. If definition exists, check component type.
    if (!def) return true;
    const type = def.customComponent?.type;
    return !type || type === 'textarea';
  });

  // Select the best candidate
  // If we have text-like variables, use the first one
  // Otherwise, use the first changed variable
  const bestEntry = textLikeEntries.length > 0 ? textLikeEntries[0] : changedEntries[0];

  const [_, value] = bestEntry;

  // Truncate if too long
  if (value.length > 60) {
    return value.substring(0, 57) + '...';
  }

  return value;
}

/**
 * Generate a run name from the first user message
 * Takes the first sentence or first N words, whichever is shorter
 */
export function generateRunNameFromMessage(message: string, maxLength: number = 40): string {
  if (!message || message.trim().length === 0) {
    return generateDefaultName();
  }

  // Clean the message
  let cleaned = message.trim();

  // Remove markdown formatting
  cleaned = cleaned.replace(/[#*_`]/g, '');

  // Get first sentence (stop at . ! ? or newline)
  const firstSentence = cleaned.match(/^[^.!?\n]+/)?.[0] || cleaned;

  // Truncate to max length
  if (firstSentence.length <= maxLength) {
    return firstSentence.trim();
  }

  // Truncate at word boundary
  const truncated = firstSentence.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

/**
 * Generate a default name with timestamp
 */
export function generateDefaultName(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  return `Conversation - ${date} at ${time}`;
}

/**
 * Generate a name based on source type and optional source name
 */
export function generateNameFromSource(
  sourceType: string,
  sourceName?: string,
  messageContent?: string
): string {
  if (messageContent) {
    return generateRunNameFromMessage(messageContent);
  }

  if (sourceName) {
    return `${sourceName} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  const typeNames: Record<string, string> = {
    prompt: 'Prompt Run',
    chat: 'Chat',
    applet: 'Applet Run',
    cockpit: 'Cockpit Session',
    workflow: 'Workflow Run',
    custom: 'AI Run',
  };

  const typeName = typeNames[sourceType] || 'AI Run';
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return `${typeName} - ${time}`;
}

/**
 * Sanitize a user-provided name
 */
export function sanitizeRunName(name: string): string {
  if (!name || name.trim().length === 0) {
    return generateDefaultName();
  }

  // Remove excessive whitespace
  let cleaned = name.trim().replace(/\s+/g, ' ');

  // Limit length
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 97) + '...';
  }

  return cleaned;
}

