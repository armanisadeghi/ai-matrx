/**
 * Prompt preview — the read-only "what is about to go to the model" payload
 * returned by the backend dry-run (POST /ai/manual with dry_run:true). Mirrors
 * aidream `api/utils/preview.serialize_preview`.
 */
export interface PromptPreview {
  model: string | null;
  /** The complete rendered system prompt — context, tools list, and the
   *  Matrx Directives guidance all already assembled. */
  system_prompt: string | null;
  messages: Array<Record<string, unknown>>;
  tools: string[];
  /** One sentence, set when the platform's default tool schemas were left out
   *  of this request (the org's default-tool-schemas setting), naming them and
   *  the estimated input-token saving. Null when nothing was withheld. */
  tool_schema_notice?: string | null;
  params: Record<string, unknown>;
  loop_bounds: { max_iterations: number; max_retries_per_iteration: number };
  conversation_id: string | null;
  ephemeral: boolean;
}
