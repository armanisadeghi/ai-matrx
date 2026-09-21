/**
 * Surface manifest — Your staff (`matrx-user/staff`).
 *
 * `/staff` — the in-app door onto a person's Personal Staff: the ONE
 * conversation their texts and their phone calls already use, opened through
 * `POST {aidream}/personal-staff/open` and run on the
 * `personal_staff.front_line` mandate.
 *
 * WHY THIS SURFACE EXISTS SEPARATELY FROM `matrx-user/chat`. The room is the
 * canonical chat surface — `ChatRoomClient`, same column, same composer — but
 * the surface NAME is what tells the Holder where it is standing. Answering a
 * person at their desk with SMS brevity is the failure this row prevents: the
 * live `ui.ui_surface` row's intro says the reply may be as long as the answer
 * needs, that markdown and links are fine, that this is the same thread as
 * their texts and calls, and that files and commands land in the person's own
 * sandbox and persist.
 *
 * 🚨 NO `intro` HERE, DELIBERATELY. `SurfaceManifest.intro` is MIRRORED to
 * `ui_surface.intro`, and that row is already authored and live (aidream
 * migration 0977). A second copy in this file could only drift from it or
 * overwrite it. The database row is the source of truth for what the Holder is
 * told; this manifest declares the surface to the client.
 *
 * HOW THE NAME REACHES THE SERVER: by ROUTE, not by launch option.
 * `ChatRoomClient` passes `runtime: { surfaceName: null }` — the explicit
 * opt-out that stops a chat room adopting its own transcript as "surface
 * context" — so `client.surface` is resolved from the pathname through
 * `SURFACE_ROUTE_MAPPINGS` in `features/surfaces/utils/route-to-surface.ts`.
 * The `/staff` row there is the wiring; this manifest is what keeps that row
 * from being a phantom (`pnpm check:surface-routes`).
 *
 * VALUES: the baseline only. The room publishes its live scope through
 * `ChatRoomClient`'s own `SurfaceRuntimeProvider`, which is registered under
 * `matrx-user/chat` — so declaring a richer set here would advertise values
 * this surface does not itself emit. When `/staff` grows a provider of its
 * own, its values are declared here and not before.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const STAFF_SURFACE_NAME = "matrx-user/staff";

export const staffManifest: SurfaceManifest = {
  surfaceName: STAFF_SURFACE_NAME,
  label: "Your staff",
  urlPattern: "/staff",
  readiness: "partial",
  readinessNote:
    "The route, the door and the route→surface mapping are wired and the ui_surface row is live. The room still publishes its scope under matrx-user/chat (ChatRoomClient's own provider), so this surface emits the baseline only.",
  groups: [],
  values: mergeBaselineValues(pickBaseline("content", "context"), []),
};
