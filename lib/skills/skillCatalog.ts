// lib/skills/skillCatalog.ts
//
// THE host wiring for `@ai-matrx/agents/skills` — the ONE skill catalog (skill list rows, skill
// categories, the stream "a skill changed" signal). The store, converters and types live in the
// package (agent core A2); this app injects identity only:
//
//   client        → the app's browser Supabase client (RLS gates every read).
//   associations  → `associationsService` (skill ↔ project membership in platform.associations).
//   errorSink     → `captureError` (source "skill-catalog"), the inspector every failure lands in.
//
// The Redux `skills` slice is a read BINDING over this catalog: every catalog change is mirrored
// into the slice (`catalogSynced`) so the existing selectors, the chat `loadedSkills` slot and the
// editors keep reading Redux while the catalog stays the single holder. The skill WRITES
// (features/skills/redux/skillsThunks.ts) report what landed through the catalog's `apply*` methods.
//
// Created ONCE, lazily (a second catalog would be a second holder of the rows).

import {
  createSkillCatalog,
  type SkillCatalog,
  type SkillCatalogClient,
} from "@ai-matrx/agents/skills";
import { supabase } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { associationsService } from "@/features/scopes/service/associationsService";
import { skillsActions } from "@/features/skills/redux/skillsSlice";

let catalog: SkillCatalog | null = null;

export function getSkillCatalog(): SkillCatalog {
  if (!catalog) {
    // supabase-js satisfies the package's structural client as-is; the cast narrows this app's
    // generated `Database` generics onto the package's deliberately generic seam.
    const created = createSkillCatalog({
      client: supabase as unknown as SkillCatalogClient,
      associations: {
        async skillIdsForProject(projectId) {
          const res = await associationsService.listForTargets("project", [projectId]);
          if (!res.ok) return { ok: false, message: res.error.message };
          return {
            ok: true,
            ids: res.data.edges
              .filter((e) => e.sourceType === "skill" && e.role === "member")
              .map((e) => e.sourceId),
          };
        },
        async projectIdsBySkill(skillIds) {
          const out: Record<string, string[]> = {};
          if (skillIds.length === 0) return out;
          const res = await associationsService.listForSources("skill", [...skillIds], "project");
          if (!res.ok) return out;
          for (const edge of res.data.edges) {
            if (edge.role !== "member") continue;
            (out[edge.sourceId] ??= []).push(edge.targetId);
          }
          return out;
        },
      },
      errorSink: (event) => {
        captureError({
          source: "skill-catalog",
          message: event.message,
          code: event.code,
          ...(event.context ? { raw: event.context } : {}),
        });
      },
    });
    // The Redux binding: mirror every catalog change into the slice.
    created.subscribe(() => {
      getStoreSingleton()?.dispatch(skillsActions.catalogSynced(created.getState()));
    });
    catalog = created;
  }
  return catalog;
}
