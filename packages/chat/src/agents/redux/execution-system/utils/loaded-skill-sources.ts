/**
 * The skills the browser has already loaded, as the minimal id/slug shape the
 * kind-skill recogniser reads — `[]` while the skills list is not loaded.
 * Lets a thunk move old kind skills into `outputKinds` without fetching.
 */

import { loadedSkills } from "../../../../host/ui-slots";
import type { ChatRootState } from "../../../../store/root-state";
import type { ShapeChipSkillSource } from "../../../components/inputs/smart-input/shape-chips";

export function selectLoadedSkillSources(state: ChatRootState): ShapeChipSkillSource[] {
  const loaded = loadedSkills(state) as {
    status: string;
    skills: Array<{ id: string; skillId: string; isActive: boolean }>;
  };
  if (loaded.status !== "ready") return [];
  return loaded.skills.map((skill) => ({
    id: skill.id,
    skillId: skill.skillId,
    isActive: skill.isActive,
  }));
}
