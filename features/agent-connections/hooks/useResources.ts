"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllResources,
  selectResourcesForSkill,
  selectResourcesStatus,
} from "../redux/skl/selectors";
import type { SklResource } from "../redux/skl/types";

// Retired 2026-07-06: the bespoke skill.resource table is gone. A skill's
// resources are now code_files/notes attached via platform.associations —
// managed by features/skills (SkillResourcesPanel + createSkillResourceThunk).
// This legacy agent-connections hook is inert (its slice is never populated);
// callers should migrate to the features/skills resource system.

export interface UseResourcesArgs {
  skillId?: string;
}

export interface UseResourcesResult {
  resources: SklResource[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  remove: (id: string) => void;
}

export function useResources({
  skillId,
}: UseResourcesArgs = {}): UseResourcesResult {
  const status = useAppSelector(selectResourcesStatus);
  const error = useAppSelector((s) => s.skl.resources.error);
  const all = useAppSelector(selectAllResources);
  const forSkill = useAppSelector(selectResourcesForSkill(skillId ?? null));

  return useMemo(
    () => ({
      resources: skillId ? forSkill : all,
      loading: status === "loading",
      error,
      reload: () => {},
      remove: () => {},
    }),
    [all, forSkill, skillId, status, error],
  );
}
