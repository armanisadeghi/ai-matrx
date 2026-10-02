/**
 * ApplicationScope — the UI-level scope object passed into agent executions.
 *
 * Extracted from scope-mapping.ts into its own leaf module so that
 * instance.types.ts and agent-execution-config.types.ts can import it
 * without pulling in scope-mapping.ts, which imports instance.types.ts
 * (breaking the circular dependency).
 */
export interface ApplicationScope {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}
