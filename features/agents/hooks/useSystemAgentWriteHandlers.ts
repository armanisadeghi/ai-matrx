"use client";

/**
 * Write handlers for `matrx-admin/system-agents` — the receiving end of the
 * surface's `writeTargets` (declared in
 * `features/surfaces/manifests/admin-system-agents.manifest.ts`).
 *
 * Registered by `SystemAgentSurfaceEmitter` on its `SurfaceRuntimeProvider`,
 * so the targets are wired across every detail sub-route of
 * `/administration/agents/system-agents/agents/[id]` — view, run, versions,
 * shortcuts, apps, widgets, surfaces.
 *
 * WHY `mode: "entity"` AND NOT `"draft"`. The skill prefers draft, and the
 * sibling `matrx-user/agent-builder` surface is draft — but neither would be
 * honest here:
 *
 *  1. This mount owns NO editor or draft state. `SystemAgentSurfaceEmitter`
 *     declares `isEditable={false}` and renders a server-rendered detail
 *     route; there is no Save bar anywhere on it. Staging a value and telling
 *     the admin "nothing is saved until you save" would be a lie — there is
 *     nothing to press.
 *  2. The HUMAN path for these exact four fields is itself an immediate
 *     per-field persist. `AgentSettingsForm` (reached from this route's own
 *     header via the Agents options menu → agent settings window) dispatches
 *     `saveAgentField` per changed field on Save. Routing the agent through
 *     the same thunk makes the agent path and the human path the same path,
 *     rather than inventing a second one.
 *
 * On `/build` the deeper `matrx-user/agent-builder` provider takes over
 * (deepest-wins), and its own draft targets are what an agent is offered
 * there. That is the correct split: where an editor exists, draft into it;
 * where none does, go through the canonical service.
 *
 * Rules this file enforces rather than trusting to the caller:
 *  - EVERY handler validates and THROWS on a bad shape, via the shared
 *    validators in `constants/agent-identity-metadata` — the same module the
 *    manifest interpolates its bounds from, so the contract the agent reads is
 *    the contract enforced. The writeback seam turns a throw into a safe error
 *    envelope the agent reads back and can correct. Nothing is coerced or
 *    truncated: on a SYSTEM agent a silent coercion would ship copy nobody
 *    approved to every user on the platform.
 *  - Nothing bypasses the canonical write path. Every field goes through the
 *    `saveAgentField` thunk (optimistic Redux update → `agent.definition`
 *    update → rollback + surfaced error on failure), never a raw supabase
 *    call.
 *  - Version snapshots refuse. Writing into a published snapshot would either
 *    fail at the database or silently corrupt the lineage record.
 *
 * The write is awaited, so a database rejection reaches the agent instead of
 * being lost in a floating promise, and `router.refresh()` runs only after it
 * lands — the route's server components (the header's agent name, the layout
 * metadata, the not-a-system-agent banner) are rendered from a server
 * `getAgent(id)` and would otherwise show the pre-write value even though the
 * surface's own read twin, which reads Redux, had already updated.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import {
  normalizeAgentCategory,
  normalizeAgentDescription,
  normalizeAgentName,
  normalizeAgentTags,
} from "@/features/agents/constants/agent-identity-metadata";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { RootState } from "@/lib/redux/store";

/**
 * Refuse before persisting anything that cannot legitimately be written.
 *
 * Deliberately does NOT refuse a non-`builtin` agent. A personal agent open in
 * this admin is a mis-navigation the route already calls out with a loud
 * banner, but the admin can still legitimately fix its description from here
 * through the settings form — so refusing the agent path would be stricter
 * than the human path it mirrors, for no safety gain. `agent_is_system` is
 * declared on the surface, so a bound agent can read whether it is looking at
 * a true system agent and say so before proposing anything.
 */
function requireWritableAgent(state: RootState, agentId: string) {
  const record = selectAgentById(state, agentId);
  if (!record) {
    throw new Error(
      "The open agent has not finished loading — try again in a moment.",
    );
  }
  if (record.isVersion) {
    throw new Error(
      "This is a published version snapshot, which is read-only. Open the live agent to change it.",
    );
  }
  return record;
}

/**
 * Returns the `getWriteHandlers` callback for the system-agents admin surface.
 *
 * Reads through the store rather than `useAppSelector` so a handler invoked at
 * apply time sees the state as it is THEN, not as it was at the last render.
 */
export function useSystemAgentWriteHandlers(
  agentId: string,
): () => SurfaceWriteHandlers {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useCallback(() => {
    /** Persist ONE field the way the settings form's own Save does. */
    const persistField = async <K extends keyof AgentDefinition>(
      field: K,
      value: AgentDefinition[K],
    ) => {
      requireWritableAgent(store.getState(), agentId);
      // `.unwrap()` re-throws the thunk's rejection so a failed database write
      // becomes an error the agent reads, not a silently swallowed no-op.
      await dispatch(saveAgentField({ agentId, field, value })).unwrap();
      // Re-render the server components that still hold the pre-write value.
      router.refresh();
    };

    return {
      agent_name: async (value: unknown) => {
        await persistField("name", normalizeAgentName(value));
      },

      agent_description: async (value: unknown) => {
        await persistField("description", normalizeAgentDescription(value));
      },

      agent_category: async (value: unknown) => {
        await persistField("category", normalizeAgentCategory(value));
      },

      agent_tags: async (value: unknown) => {
        await persistField("tags", normalizeAgentTags(value));
      },
    };
  }, [store, dispatch, router, agentId]);
}
