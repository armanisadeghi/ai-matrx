/**
 * features/knowledge/hub/hubSavedViewActions.ts — every write a hub saved
 * view makes, in one place: create, save changes, rename, share, alerts,
 * duplicate, delete (soft, through the archive door), pin (per person, on
 * user_entity_state) and "last used".
 *
 * All rows go through the one saved-views service; every refusal comes back
 * as a thrown Error carrying a sentence a person can read.
 */

import {
  archiveSurfaceView,
  createSurfaceView,
  updateSurfaceView,
  type SavedViewVisibility,
} from "@/components/official/table-saved-views-service";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  encodeSavedViewDefinition,
  HUB_VIEW_DEFINITION_VERSION,
  type HubSavedViewDefinition,
} from "@/features/knowledge/hub/hubState";
import { HUB_SAVED_VIEW_SURFACE } from "@/features/knowledge/hub/hubSavedViews";
import {
  SAVED_VIEW_TOKEN,
  type HubSavedView,
} from "@/features/knowledge/hub/hooks/useHubSidebarData";

const surfaceKey = HUB_SAVED_VIEW_SURFACE;

export async function setViewPinned(id: string, pinned: boolean): Promise<void> {
  const res = await favoritesService.setPinned(SAVED_VIEW_TOKEN, id, pinned);
  if (isScopesRpcErr(res))
    throw new Error(
      `The view was ${pinned ? "not pinned" : "not unpinned"}: ${
        (res.error as { message?: string })?.message ?? "the server refused."
      }`,
    );
}

export async function createHubView(input: {
  name: string;
  organizationId: string;
  shared: boolean;
  pinned: boolean;
  definition: HubSavedViewDefinition;
}): Promise<{ id: string; pinError: string | null }> {
  const row = await createSurfaceView({
    surfaceKey,
    organizationId: input.organizationId,
    name: input.name,
    visibility: input.shared ? "internal" : "personal",
    definition: encodeSavedViewDefinition({ ...input.definition, preset: null }),
    definitionVersion: HUB_VIEW_DEFINITION_VERSION,
  });
  let pinError: string | null = null;
  if (input.pinned) {
    try {
      await setViewPinned(row.id, true);
    } catch (err) {
      pinError = err instanceof Error ? err.message : "The view was saved but not pinned.";
    }
  }
  return { id: row.id, pinError };
}

/** "Save changes to this view" — compare-and-swap on the version I opened. */
export async function saveViewChanges(view: HubSavedView, next: HubSavedViewDefinition): Promise<void> {
  await updateSurfaceView({
    surfaceKey,
    id: view.id,
    expectedVersion: view.version,
    definition: encodeSavedViewDefinition({
      ...next,
      notifyNewMatches: view.definition?.notifyNewMatches,
      preset: view.definition?.preset ?? null,
    }),
  });
}

export async function renameView(view: HubSavedView, name: string): Promise<void> {
  if (!name.trim()) throw new Error("Give this view a name.");
  await updateSurfaceView({ surfaceKey, id: view.id, expectedVersion: view.version, name: name.trim() });
}

export async function setViewShared(view: HubSavedView, shared: boolean): Promise<void> {
  const visibility: SavedViewVisibility = shared ? "internal" : "personal";
  await updateSurfaceView({ surfaceKey, id: view.id, expectedVersion: view.version, visibility });
}

export async function setViewNotify(view: HubSavedView, on: boolean): Promise<void> {
  if (!view.definition) throw new Error("This view's definition could not be read, so it cannot be changed.");
  await updateSurfaceView({
    surfaceKey,
    id: view.id,
    expectedVersion: view.version,
    definition: encodeSavedViewDefinition({ ...view.definition, notifyNewMatches: on }),
  });
}

/** A personal, pinned copy in `organizationId` (presets and teammates' views included). */
export async function duplicateView(
  view: HubSavedView,
  organizationId: string,
): Promise<{ id: string; pinError: string | null }> {
  if (!view.definition) throw new Error("This view's definition could not be read, so it cannot be copied.");
  return createHubView({
    name: `${view.name} (copy)`,
    organizationId,
    shared: false,
    pinned: true,
    definition: { ...view.definition, notifyNewMatches: false, preset: null },
  });
}

export async function deleteView(view: HubSavedView): Promise<void> {
  await archiveSurfaceView({ surfaceKey, id: view.id, expectedVersion: view.version });
}

/**
 * Marks `last_used_at`. The door lets only the maker (or an editor) touch a
 * row, so a teammate's shared view or a preset is not touched — that is the
 * door's rule, not a failure.
 */
export async function touchView(view: HubSavedView): Promise<void> {
  if (!view.mine || view.builtIn) return;
  await updateSurfaceView({ surfaceKey, id: view.id, touch: true });
}
