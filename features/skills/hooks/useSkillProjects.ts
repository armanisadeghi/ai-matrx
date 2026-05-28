/**
 * features/skills/hooks/useSkillProjects.ts
 *
 * Hook for managing skill ↔ ctx_project associations. The skill row's
 * `projectIds` array is the source of truth (populated by GET /skills);
 * this hook wraps the add/remove thunks and exposes a small imperative
 * API for the picker component.
 */

"use client";

import { useMemo } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { makeSelectSkillById } from "../redux/skillsSelectors";
import { addSkillProject, removeSkillProject } from "../redux/skillsThunks";

export interface UseSkillProjectsResult {
  /** Current associations (UUIDs of ctx_projects). */
  projectIds: string[];
  /** Associate the skill with a project. Idempotent. */
  associate: (projectId: string) => Promise<void>;
  /** Remove the association. Idempotent. */
  disassociate: (projectId: string) => Promise<void>;
}

export function useSkillProjects(skillId: string): UseSkillProjectsResult {
  const dispatch = useAppDispatch();
  const selectSkill = useMemo(makeSelectSkillById, []);
  const row = useAppSelector((state) => selectSkill(state, skillId));

  return {
    projectIds: row?.projectIds ?? [],
    associate: async (projectId: string) => {
      await dispatch(addSkillProject({ skillId, projectId }));
    },
    disassociate: async (projectId: string) => {
      await dispatch(removeSkillProject({ skillId, projectId }));
    },
  };
}
