"use client";

/**
 * Write handlers for `matrx-admin/system-agents` — the receiving end of the
 * four `writeTargets` declared on
 * `features/surfaces/manifests/admin-system-agents.manifest.ts`.
 *
 * These are SYSTEM agents: the ones the whole platform runs. So the handlers
 * here are deliberately paranoid, and every rule is enforced in this file
 * rather than trusted to the caller or to the confirm dialog:
 *
 *  1. EVERY handler validates and THROWS on a bad shape. `applySurfaceWrite`
 *     turns a throw into a loud, captured envelope the agent reads back — a
 *     wrong value is the agent's error to hear about, never something quietly
 *     coerced into a definition every user of the platform loads.
 *  2. Nothing bypasses the canonical write path. All four go through
 *     `saveAgentField`, which is exactly what `AgentSettingsForm`'s own Save
 *     button dispatches, once per changed field, when an admin edits these
 *     fields by hand from the header's "Edit Agent Info". There is no second
 *     write path and no raw supabase call here.
 *  3. A write that did not land must not report success. This is the sharp
 *     edge on this surface: `saveAgentField` DOES throw on a failed update
 *     (rollback + `pgErrorToError`), but it is a `createAsyncThunk`, so a bare
 *     `dispatch(...)` swallows that throw into a `rejected` action and resolves
 *     happily — which is precisely why the admin's own form fails silently
 *     today. Every handler here therefore `.unwrap()`s the thunk AND re-reads
 *     the record afterwards, and throws if the value did not actually land.
 *
 * Mounted by the agent DETAIL page
 * (`app/(admin)/administration/agents/system-agents/agents/[id]/page.tsx`),
 * NOT by the route layout. On `/build` the nested `matrx-user/agent-builder`
 * provider owns these same four field names as reviewable DRAFT targets and
 * wins deepest-first; registering here as well would advertise one target name
 * twice with two contradictory modes. See the manifest's `writeTargets` block
 * for the full per-mount reasoning.
 */

import { useCallback } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_SYSTEM_AGENTS_SURFACE_NAME } from "@/features/surfaces/manifests/admin-system-agents.manifest";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { RootState } from "@/lib/redux/store";

/** A non-empty trimmed string, or a throw naming the target. */
function requireText(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects a string value; got ${value === null ? "null" : typeof value}.`,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${target} expects a non-empty string.`);
  }
  return trimmed;
}

/**
 * Refuse loudly BEFORE writing anything, for every reason this page can know
 * about: no agent open, record still loading, a read-only version snapshot, or
 * a viewer without admin rights.
 *
 * The rights check uses `selectIsAdmin` — the same bar the `(admin)` route
 * layout itself gates on (`checkIsUserAdmin`), deliberately not the stricter
 * `selectIsSuperAdmin`. Refusing an agent a change the very same person can
 * make by hand two clicks away would be theatre, not safety; the real
 * enforcement is RLS on `agent.definition` either way.
 */
function requireWritableSystemAgent(state: RootState, agentId: string) {
  if (!agentId) {
    throw new Error(
      "No system agent is open on this page, so there is nothing to write to. Open an agent from the roster first.",
    );
  }
  if (!selectIsAdmin(state)) {
    throw new Error(
      "Editing a system agent requires Matrx admin rights, which this account does not have.",
    );
  }
  const record = selectAgentById(state, agentId);
  if (!record) {
    throw new Error(
      "The system agent has not finished loading — try again in a moment.",
    );
  }
  if (record.isVersion) {
    throw new Error(
      "This is a published version snapshot, which is read-only. Open the live agent to change it.",
    );
  }
  return record;
}

export function SystemAgentWriteTargets({ agentId }: { agentId: string }) {
  const store = useAppStore();
  const dispatch = useAppDispatch();

  /**
   * Persist ONE field the way the admin's own Save does, then prove it landed.
   *
   * `.unwrap()` re-throws the thunk's rejection (a bare dispatch would not),
   * and the re-read closes the remaining gap: `saveAgentField` is optimistic,
   * so a rolled-back write must not be reported as a success just because the
   * promise settled.
   */
  const saveField = useCallback(
    async <K extends keyof AgentDefinition>(
      target: string,
      field: K,
      value: AgentDefinition[K],
      matches: (current: AgentDefinition[K]) => boolean,
    ) => {
      requireWritableSystemAgent(store.getState(), agentId);

      try {
        await dispatch(saveAgentField({ agentId, field, value })).unwrap();
      } catch (error) {
        throw new Error(
          `${target} was not saved — the server rejected the change: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // Re-read the record the emitter publishes as this target's read twin.
      // If the optimistic value was rolled back, it is gone by now.
      const saved = selectAgentById(store.getState(), agentId);
      if (!saved || !matches(saved[field] as AgentDefinition[K])) {
        throw new Error(
          `${target} did not persist — the agent still shows its previous value. Nothing was changed.`,
        );
      }
    },
    [store, dispatch, agentId],
  );

  useSurfaceWriteHandlers(ADMIN_SYSTEM_AGENTS_SURFACE_NAME, {
    agent_description: async (value: unknown) => {
      const description = requireText(value, "agent_description");
      await saveField(
        "agent_description",
        "description",
        description,
        (current) => current === description,
      );
    },

    agent_name: async (value: unknown) => {
      const name = requireText(value, "agent_name");
      await saveField("agent_name", "name", name, (current) => current === name);
    },

    agent_category: async (value: unknown) => {
      const category = requireText(value, "agent_category");
      await saveField(
        "agent_category",
        "category",
        category,
        (current) => current === category,
      );
    },

    agent_tags: async (value: unknown) => {
      // Full replacement. An empty array is legitimate — that is how every tag
      // gets cleared — so it is not treated as a bad shape. Tags are free text
      // with no vocabulary constant to check against, so shape is all this can
      // honestly enforce.
      if (!Array.isArray(value)) {
        throw new Error(
          "agent_tags expects an array of tag strings and REPLACES the whole set (pass [] to clear all tags).",
        );
      }
      const tags = value.map((entry, index) => {
        if (typeof entry !== "string" || !entry.trim()) {
          throw new Error(
            `agent_tags[${index}] must be a non-empty string; got ${JSON.stringify(entry)}.`,
          );
        }
        return entry.trim();
      });
      await saveField(
        "agent_tags",
        "tags",
        tags,
        (current) =>
          Array.isArray(current) &&
          current.length === tags.length &&
          current.every((entry, index) => entry === tags[index]),
      );
    },
  });

  return null;
}
