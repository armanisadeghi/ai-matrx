"use client";

/**
 * useDiagramAgents — resolves the diagram-scoped agents for the mermaid
 * editor surface (role `diagram_editor` on `matrx-user/mermaid-editor`)
 * through the CANONICAL surface-config resolver (manifest/DB role default →
 * global pref → org prefs → user pref — `surface-config.service`), then
 * hydrates display names from the safe `agent.card` view.
 *
 * Consumed by the chat MermaidBlock's v3 context menu ("Edit with <agent>")
 * — the seeded Diagram Editor agent resolves first (role position 0).
 * Module-cached: many mermaid blocks per conversation, one fetch per session.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  fetchSurfaceConfigBundle,
  resolveSurfaceConfig,
} from "@/features/surfaces/services/surface-config.service";
// NOTE: the surface name comes from the manifest, NOT useMermaidAgentEdit's
// MERMAID_SURFACE_NAME re-export — importing that module would drag the whole
// agent execution system into every consumer's chunk (chat MermaidBlock).
import { mermaidEditorManifest } from "@/features/surfaces/manifests/mermaid-editor.manifest";

export interface DiagramAgentEntry {
  agentId: string;
  name: string;
}

export const DIAGRAM_EDITOR_ROLE = "diagram_editor";

let cache: Promise<DiagramAgentEntry[]> | null = null;

async function resolveDiagramAgents(): Promise<DiagramAgentEntry[]> {
  let agentIds: string[] = [];
  try {
    const bundle = await fetchSurfaceConfigBundle(
      mermaidEditorManifest.surfaceName,
    );
    const resolved = resolveSurfaceConfig(bundle);
    agentIds = (resolved.roles[DIAGRAM_EDITOR_ROLE]?.effective ?? []).map(
      (e) => e.agentId,
    );
  } catch (err) {
    console.error(
      "[useDiagramAgents] surface-config resolution FAILED — falling back to the manifest default agent",
      err,
    );
  }

  if (agentIds.length === 0) {
    // Loud recovery: the DB role row should exist (manifest sync). The
    // manifest default keeps the feature alive while someone fixes the sync.
    const manifestDefault = mermaidEditorManifest.agentRoles?.find(
      (r) => r.name === DIAGRAM_EDITOR_ROLE,
    )?.defaultAgentId;
    if (manifestDefault) {
      console.warn(
        "[useDiagramAgents] no resolved diagram_editor role agents in the DB — using the manifest default. Run the surface manifest sync.",
        { manifestDefault },
      );
      agentIds = [manifestDefault];
    }
  }
  if (agentIds.length === 0) return [];

  const { data, error } = await createClient()
    .schema("agent")
    .from("card")
    .select("id, name")
    .in("id", agentIds);
  if (error) {
    console.error(
      "[useDiagramAgents] agent.card fetch FAILED — diagram agents will be missing from the context menu",
      { agentIds, error },
    );
    throw error;
  }

  const nameById = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.id) nameById.set(row.id, row.name ?? "Agent");
  }
  // Preserve resolution order (default/position 0 first); drop agents the
  // card RLS hid from this user.
  return agentIds
    .filter((id) => nameById.has(id))
    .map((id) => ({ agentId: id, name: nameById.get(id) as string }));
}

export function useDiagramAgents(): DiagramAgentEntry[] {
  const [agents, setAgents] = useState<DiagramAgentEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!cache) {
      cache = resolveDiagramAgents().catch((err) => {
        cache = null; // allow a retry on the next mount
        throw err;
      });
    }
    cache
      .then((list) => {
        if (!cancelled) setAgents(list);
      })
      .catch(() => {
        // Already screamed inside resolveDiagramAgents.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return agents;
}
