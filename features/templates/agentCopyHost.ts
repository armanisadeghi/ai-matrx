// features/templates/agentCopyHost.ts — the browser wiring of the template agent copy.
//
// `templateAgentCopier(dispatch)` is the `copyAgent` to pass to @ai-matrx/records'
// `installTemplate`: every port runs as the signed-in person through the shared
// installer's own doors (`duplicateAgent` thunk, `nameCopiedAgent`, `writeAgent`).
// The logic lives in `agentCopy.ts`.

import type { AppDispatch } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { duplicateAgent, saveAgentField } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { nameCopiedAgent, writeAgent } from "./agentWrites";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@ai-matrx/agents/generated/api-types";
import {
  createTemplateAgentArchiver,
  createTemplateAgentCopier,
  type TemplateAgentCopyPorts,
  type TemplateAgentCopier,
  type TemplateAgentCopyOptions,
} from "./agentCopy";

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

/** Archive through the agents list's own Archive (`is_archived`), as every template removal does. */
function archivePort(dispatch: AppDispatch): TemplateAgentCopyPorts["archive"] {
  return async (agentId) => {
    try {
      await dispatch(saveAgentField({ agentId, field: "isArchived", value: true as never })).unwrap();
    } catch (err) {
      throw new Error(`The agent ${agentId} was not archived: ${messageOf(err)}`);
    }
  };
}

/** The `archiveAgent` to pass to `archiveTemplateInstall`. */
export function templateAgentArchiver(dispatch: AppDispatch): (agentId: string) => Promise<void> {
  return createTemplateAgentArchiver({ archive: archivePort(dispatch) });
}

/** The `copyAgent` to pass to `installTemplate`, running as the signed-in person. */
export function templateAgentCopier(dispatch: AppDispatch, options?: TemplateAgentCopyOptions): TemplateAgentCopier {
  return createTemplateAgentCopier(
    {
      async platformAgentIdByName(name) {
        const systemOrgId = await resolveSystemOrgId();
        const { data, error } = await supabase
          .schema("agent")
          .from("definition")
          .select("id")
          .eq("organization_id", systemOrgId)
          .eq("name", name)
          .is("deleted_at", null)
          .maybeSingle();
        // maybeSingle refuses two rows (PGRST116): the template must then carry the id.
        if (error) throw new Error(`The platform agent "${name}" could not be resolved by name: ${error.message}`);
        if (!data) throw new Error(`No platform agent is named "${name}".`);
        return (data as { id: string }).id;
      },
      async duplicate(sourceAgentId, organizationId) {
        try {
          // A template copy follows its platform agent until the person edits it (templates7_b).
          return await dispatch(
            duplicateAgent({ agentId: sourceAgentId, organizationId, followsSource: true }),
          ).unwrap();
        } catch (err) {
          throw new Error(`Could not copy the agent: ${messageOf(err)}`);
        }
      },
      name: (agentId, organizationId, base, also) => nameCopiedAgent(agentId, organizationId, base, () => also),
      write: (agentId, what, build) => writeAgent(agentId, what, build),
      archive: archivePort(dispatch),
      async recordsToolId() {
        const { data, error } = await supabase
          .schema("tool")
          .from("definition")
          .select("id")
          .eq("name", "records")
          .is("deleted_at", null)
          .maybeSingle();
        if (error || !data) return null;
        return (data as { id: string }).id;
      },
    },
    options,
  );
}

/**
 * A template's workflow: aidream `POST /workflows` in the captured organization, as the person
 * (the studio.s own create door). Answers the workflow's id.
 */
export function templateWorkflowCreator(
  dispatch: AppDispatch,
): (organizationId: string, workflow: { name: string; description: string; definition: unknown }) => Promise<string> {
  return async (organizationId, workflow) => {
    const result = await dispatch(
      callApi({
        path: "/workflows",
        method: "POST",
        scopeOverrides: { organization_id: organizationId },
        body: {
          name: workflow.name,
          description: workflow.description,
          definition: workflow.definition as components["schemas"]["CreateWorkflowRequest"]["definition"],
        },
      }),
    );
    if (result.error) throw new Error(`Could not create the workflow "${workflow.name}": ${result.error.message}`);
    const created = result.data as components["schemas"]["DefinitionRecord"] | undefined;
    const id = created?.id ?? created?.definition_id ?? null;
    if (!id) throw new Error(`The workflow "${workflow.name}" was created but the server sent back no id.`);
    return id;
  };
}
