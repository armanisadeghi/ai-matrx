// lib/skills/skillCatalog.ts
//
// THE skill catalog is chat's binding of the core `createSkillCatalog` (agent core B6) — one
// instance per page. This app adds only its Redux mirror: the `skills` slice follows the
// catalog (`catalogSynced`) so the editors' selectors stay unchanged. Writes stay in
// `features/skills` and report what landed through the catalog's mirror methods.

import type { SkillCatalog } from "@ai-matrx/agents/skills";
import { getSkillCatalog as getChatSkillCatalog } from "@ai-matrx/chat/agents/identity/skill-catalog";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { skillsActions } from "@/features/skills/redux/skillsSlice";

let mirrored = false;

export function getSkillCatalog(): SkillCatalog {
  const catalog = getChatSkillCatalog();
  if (!mirrored) {
    mirrored = true;
    catalog.subscribe(() => {
      getStoreSingleton()?.dispatch(skillsActions.catalogSynced(catalog.getState()));
    });
  }
  return catalog;
}
