// features/kits/templateAgentCopyHost.ts — the browser wiring of the template agent copy.
//
// `templateAgentCopier(dispatch)` is the `copyAgent` to pass to @ai-matrx/records'
// `installTemplate`: every port runs as the signed-in person through the kit
// installer's own doors (`duplicateAgent` thunk, `nameCopiedAgent`, `writeAgent`).
// The logic lives in `templateAgentCopy.ts`.

import type { AppDispatch } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { duplicateAgent } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { nameCopiedAgent, writeAgent } from "./installer";
import {
  createTemplateAgentCopier,
  type TemplateAgentCopier,
  type TemplateAgentCopyOptions,
} from "./templateAgentCopy";

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
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
          return await dispatch(duplicateAgent({ agentId: sourceAgentId, organizationId })).unwrap();
        } catch (err) {
          throw new Error(`Could not copy the agent: ${messageOf(err)}`);
        }
      },
      name: (agentId, organizationId, base) => nameCopiedAgent(agentId, organizationId, base),
      write: (agentId, what, build) => writeAgent(agentId, what, build),
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
