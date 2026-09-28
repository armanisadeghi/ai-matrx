/**
 * Prompt preview — the read-only "what is about to go to the model" payload
 * returned by the backend dry-run (POST /ai/manual with dry_run:true). Mirrors
 * aidream `api/utils/preview.serialize_preview`.
 */
export interface PromptPreview {
  model: string | null;
  /** One sentence, set when this turn asks decision questions: how the model
   *  receives them (a text model gets them rendered as text in the last user
   *  message, with the instruction inside and no system prompt or tools; a
   *  native decision model gets the state and the typed questions). Null for
   *  an ordinary chat turn. */
  decision_notice?: string | null;
  /** The complete rendered system prompt — context, tools list, and the
   *  Matrx Directives guidance all already assembled. */
  system_prompt: string | null;
  messages: Array<Record<string, unknown>>;
  tools: string[];
  params: Record<string, unknown>;
  loop_bounds: { max_iterations: number; max_retries_per_iteration: number };
  conversation_id: string | null;
  ephemeral: boolean;
}
