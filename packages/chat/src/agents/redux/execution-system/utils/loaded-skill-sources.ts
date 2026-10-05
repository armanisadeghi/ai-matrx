/**
 * The skills the browser has already loaded, as the minimal id/slug shape the
 * kind-skill recogniser reads — `[]` while the skills list is not loaded.
 * Lets a thunk move old kind skills into `outputKinds` without fetching.
 */

import { selectAllSkills } from "@host/features/skills/redux/skillsSelectors";
import type { ShapeChipSkillSource } from "../../../components/inputs/smart-input/shape-chips";

export function selectLoadedSkillSources(state: unknown): ShapeChipSkillSource[] {
  const loaded = (state as { skills?: { skills?: { status?: string } } }).skills?.skills?.status;
  if (loaded !== "ready") return [];
  return selectAllSkills(state as Parameters<typeof selectAllSkills>[0]).map((skill) => ({
    id: skill.id,
    skillId: skill.skillId,
    isActive: skill.isActive,
  }));
}
