"use client";

import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { stripNullish } from "@/utils/supabase/payload";

type AgentInsert = Database["agent"]["Tables"]["definition"]["Insert"];

export interface AgentBuilderConfig {
  name: string;
  description?: string;
  systemMessage: string;
  userMessage?: string;
  variableDefaults?: VariableDefinition[];
  settings?: Record<string, unknown>;
}

export interface AgentBuilderResult {
  success: boolean;
  agentId?: string;
  error?: string;
}

const DEFAULT_MODEL_ID = "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd";

/**
 * Builds a minimal INSERT payload for agx_agent.
 *
 * Only includes fields we have real values for. Omitted fields fall back to
 * the DB defaults (e.g. custom_tools → '[]'::jsonb, tools → '{}', is_active
 * → true, agent_type → 'user'). NEVER send `null` for NOT NULL columns —
 * see utils/supabase/payload.ts for the full rationale.
 */
function configToInsertPayload(
  config: AgentBuilderConfig,
): Omit<
  AgentInsert,
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
> {
  const messages = [
    {
      role: "system" as const,
      content: [{ type: "text", text: config.systemMessage.trim() }],
    },
    ...(config.userMessage?.trim()
      ? [
          {
            role: "user" as const,
            content: [{ type: "text", text: config.userMessage.trim() }],
          },
        ]
      : []),
  ];

  const variableDefinitions = (config.variableDefaults ?? []).map((v) => ({
    name: v.name,
    required: v.required ?? false,
    defaultValue: v.defaultValue ?? "",
    ...(v.helpText ? { helpText: v.helpText } : {}),
    ...(v.customComponent ? { customComponent: v.customComponent } : {}),
  }));

  const description = config.description?.trim();

  const raw: Partial<AgentInsert> = {
    name: config.name.trim(),
    model_id: DEFAULT_MODEL_ID,
    messages: messages as unknown as AgentInsert["messages"],
    ...(description ? { description } : {}),
    ...(variableDefinitions.length
      ? {
          variable_definitions:
            variableDefinitions as unknown as AgentInsert["variable_definitions"],
        }
      : {}),
    ...(config.settings
      ? { settings: config.settings as AgentInsert["settings"] }
      : {}),
  };

  return stripNullish(raw) as Omit<
    AgentInsert,
    | "id"
    | "created_at"
    | "updated_at"
    | "source_agent_id"
    | "source_snapshot_at"
  >;
}

export async function createAgentFromBuilder(
  config: AgentBuilderConfig,
): Promise<AgentBuilderResult> {
  try {
    if (!config.name?.trim()) {
      toast.error("Please enter a name for your agent");
      return { success: false, error: "Name is required" };
    }
    if (!config.systemMessage?.trim()) {
      toast.error("System message cannot be empty");
      return { success: false, error: "System message is required" };
    }

    const supabase = createClient();

    // RLS on agx_agent requires `user_id = auth.uid()` for inserts. When
    // missing, the server rejects the row and the error body can come
    // back as an empty object ({}), which produced the mystery
    // "Agent insert error: {}" in production. Resolve the current user
    // first and stamp it on the payload.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      const msg =
        authError?.message ??
        "You must be signed in to create an agent.";
      toast.error("Failed to create agent", { description: msg });
      return { success: false, error: msg };
    }

    const payload = {
      ...configToInsertPayload(config),
      user_id: authData.user.id,
    } satisfies AgentInsert;

    const { data, error: insertError } = await supabase
      .schema("agent")
      .from("definition")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      // Supabase returns an error shape like
      //   { message, details, hint, code }
      // but RLS denials sometimes arrive with all fields blank. Pull
      // whatever we can so the user sees something useful.
      const message =
        insertError.message ||
        insertError.details ||
        insertError.hint ||
        "Insert was rejected (possibly by RLS).";
      console.error("Agent insert error:", {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
      });
      toast.error("Failed to create agent", { description: message });
      return { success: false, error: message };
    }

    toast.success("Agent created!", { description: "Opening the builder..." });
    return { success: true, agentId: data.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating agent:", error);
    toast.error("Failed to create agent", { description: msg });
    return { success: false, error: msg };
  }
}

export function useAgentBuilder(onComplete?: () => void) {
  const router = useRouter();

  return {
    createAgent: async (config: AgentBuilderConfig) => {
      const result = await createAgentFromBuilder(config);
      if (result.success && result.agentId) {
        onComplete?.();
        router.push(`/agents/${result.agentId}/build`);
        router.refresh();
      }
      return result;
    },
  };
}
