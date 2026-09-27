// features/flashcards/data/deckOperations.ts
//
// The deck-level operations the Flashcards list offers — rename, duplicate,
// file into folders, change who can see it — in ONE place, so the row menu and
// the agent's write targets (update_decks / duplicate_decks) save through the
// same calls and can never drift (page-pass 2026-09-27).
//
// Every function throws a sentence a person can read; callers show it.

import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { forkSharedResource } from "@/utils/permissions/shareLinks";
import { fcService } from "./fcService";
import { EDGE_ROLE, type FcSetRow } from "./types";

export type DeckVisibilityValue = FcSetRow["visibility"];

export async function renameDeck(id: string, name: string): Promise<FcSetRow> {
  const clean = name.trim();
  if (!clean) throw new Error("A deck needs a name.");
  const res = await fcService.updateSet(id, { name: clean });
  if (res.error || !res.data) throw new Error(res.error ?? "The new name was not saved.");
  return res.data;
}

export async function setDeckVisibility(
  id: string,
  visibility: DeckVisibilityValue,
): Promise<FcSetRow> {
  const res = await fcService.updateSetVisibility(id, visibility);
  if (res.error || !res.data)
    throw new Error(res.error ?? "Who can see this deck was not changed.");
  return res.data;
}

/** Replace the folders a deck is filed under (an empty list = no folder). */
export async function setDeckFolders(input: {
  id: string;
  organizationId: string;
  folderIds: string[];
}): Promise<void> {
  const res = await associationsService.setTargets({
    sourceType: "fc_set",
    sourceId: input.id,
    targetType: "category",
    targetIds: input.folderIds,
    orgId: input.organizationId,
    role: EDGE_ROLE.theme,
  });
  if (isScopesRpcErr(res))
    throw new Error(res.error.message || "The deck's folders were not saved.");
}

/**
 * Copy a deck (its cards and their layers) into the person's own library, then
 * give the copy its name. Works for the person's own deck and for any deck they
 * can see. The organization picker asks when there is more than one.
 */
export async function duplicateDeck(input: {
  id: string;
  name: string;
}): Promise<{ id: string; name: string }> {
  const forked = await forkSharedResource("fc_set", input.id);
  if (!forked.success || !forked.path)
    throw new Error(forked.error ?? "The deck was not copied.");
  const newId = forked.path.split("/").pop() ?? "";
  if (!newId) throw new Error("The copy was made but its id could not be read.");
  const renamed = await renameDeck(newId, input.name);
  return { id: renamed.id, name: renamed.name };
}
