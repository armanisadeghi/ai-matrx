/** The task quick-create seed a chat message hands the host (the host's task UI owns the slice). */
export interface PendingSource {
  // Null when the captured content has no registered entity row (raw content,
  // retired prompt-result, scraper-result) → the task is created with NO edge.
  // Never a phantom token.
  entity_type: string | null;
  entity_id: string | null;
  label?: string;
  metadata?: Record<string, unknown>;
  prePopulate?: {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  };
}
