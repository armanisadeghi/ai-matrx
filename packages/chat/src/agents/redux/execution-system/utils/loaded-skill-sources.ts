/**
 * The skills the browser has already loaded, as the minimal id/slug shape the
 * kind-skill recogniser reads — `[]` while the skills list is not loaded.
 * Lets a thunk move old kind skills into `outputKinds` without fetching.
 */

import {
  selectAllSkills,
  selectSkillsStatus,
} from "@host/features/skills/redux/skillsSelectors";
import type { ChatRootState } from "../../../../store/root-state";
import type { ShapeChipSkillSource } from "../../../components/inputs/smart-input/shape-chips";

export function selectLoadedSkillSources(state: ChatRootState): ShapeChipSkillSource[] {
  if (selectSkillsStatus(state) !== "ready") return [];
  return selectAllSkills(state).map((skill) => ({
    id: skill.id,
    skillId: skill.skillId,
    isActive: skill.isActive,
  }));
}
