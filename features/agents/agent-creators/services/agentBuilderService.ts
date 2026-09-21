"use client";

import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { DEFAULT_AGENT_MODEL_ID } from "@/features/agents/constants/blank-agent";
import { stripNullish } from "@/utils/supabase/payload";
// The ONE write-organization resolver (explicit value → the org the user
// SELECTED → refuse). `agent.definition` is org-scoped and its sibling write
// path (`agentDefinitionToInsert`) already refuses a row with no organization;
// this path must not be the quiet one. Law:
// common-docs/policies/context-is-carried-never-rebuilt.md.
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

type AgentInsert = Database["agent"]["Tables"]["definition"]["Insert"];

export interface AgentBuilderConfig {
  name: string;
  description?: string;
  systemMessage: string;
  userMessage?: string;
  variableDefaults?: VariableDefinition[];
  settings?: Record<string, unknown>;
  /** A JSON schema for the agent's answer, when the draft carries one. */
  outputSchema?: Record<string, unknown>;
  /** The agent's declared input kind, when the draft carries one. */
  inputKind?: string;
}

/**
 * WHO OWNS THE AGENT BEING CREATED. The default — the person, in the
 * organization they selected — is what every creation door has always done.
 * The Mandate workspace's "+ Agent" door passes the rung it stands on instead:
 * the system rung runs for every user on the platform, so its agent is a
 * SYSTEM agent (builtin, homed in the Matrx System organization); an
 * organization's rung gets an agent that organization owns; a person's rung
 * gets their own. The same rule the holder picker enforces on the list.
 */
export type AgentOwner =
  | { kind: "user" }
  | { kind: "organization"; organizationId: string }
  | { kind: "system" };

export interface AgentBuilderResult {
  success: boolean;
  agentId?: string;
  error?: string;
}

// One constant for every creation path — see blank-agent.ts for why the old
// pin (a deprecated small flash model) was the wrong seat for a tool-loop agent.
const DEFAULT_MODEL_ID = DEFAULT_AGENT_MODEL_ID;

/**
 * Builds a minimal INSERT payload for agent.definition.
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
    ...(config.outputSchema
      ? { output_schema: config.outputSchema as AgentInsert["output_schema"] }
      : {}),
    ...(config.inputKind?.trim() ? { input_kind: config.inputKind.trim() } : {}),
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
  owner: AgentOwner = { kind: "user" },
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

    // RLS on agent.definition requires `user_id = auth.uid()` for inserts. When
    // missing, the server rejects the row and the error body can come
    // back as an empty object ({}), which produced the mystery
    // "Agent insert error: {}" in production. Resolve the current user
    // first and stamp it on the payload.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      const msg =
        authError?.message ?? "You must be signed in to create an agent.";
      toast.error("Failed to create agent", { description: msg });
      return { success: false, error: msg };
    }

    // Organization is carried, never guessed. `ensureOrgId` throws
    // `OrganizationContextError` ("Select an organization before sending this
    // request.") when nothing is selected; the catch below turns that into the
    // same honest toast + `{ success: false }` every other failure here uses,
    // and NOTHING is inserted.
    // org-fallback-deliberate: the explicit owner rung, not an absent request context, decides whether this is the platform's built-in agent or a named organization's agent.
    // The owner decides the home. A system agent is `builtin` in the Matrx
    // System organization (RLS admits that row for a super admin only — the
    // refusal below is the server's, verbatim). An organization-owned agent
    // is homed in THAT organization, whatever the person has selected.
    const organizationId =
      owner.kind === "system"
        ? SYSTEM_ORGANIZATION_ID
        : owner.kind === "organization"
          ? owner.organizationId
          : await ensureOrgId(undefined);

    const payload = {
      ...configToInsertPayload(config),
      ...(owner.kind === "system" ? { agent_type: "builtin" } : {}),
      created_by: authData.user.id,
      organization_id: organizationId,
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

    toast.success("Agent created!");
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
        // agent-link-ok: the builder just created this agent for this user; it is a user agent by construction
        router.push(`/agents/${result.agentId}/build`);
        router.refresh();
      }
      return result;
    },
  };
}
