// features/applets/browse/surface.ts
//
// The `matrx-user/agent-apps` read for the /applets list: the ONE pure
// list → scope mapper over the controller the shell already holds (never
// fetches). A failed read reports nothing that would contradict the error.

import type { EntityListSurface, EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import { APPLETS_SURFACE_NAME, createAppletsScope } from "@/features/surfaces/manifests/applets.manifest";
import type { AppletListRow } from "./service";

export function createAppletListSurfaceScope(list: EntityListSurfaceController<AppletListRow>) {
  if (list.isLoading || list.error != null) return createAppletsScope({});
  return createAppletsScope({
    listed_app_count: list.total,
    listed_apps_summary: list.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
    })),
  });
}

export const APPLET_LIST_SURFACE: EntityListSurface<AppletListRow> = {
  surfaceName: APPLETS_SURFACE_NAME,
  getScope: createAppletListSurfaceScope,
};
