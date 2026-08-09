/**
 * Surface manifest — Share (`matrx-user/share`).
 *
 * Overlay surface for the resource sharing window
 * (`features/window-panels/windows/ShareModalWindow.tsx`, overlay id
 * `shareModalWindow`). Manages access to ONE resource (note, task, chat,
 * file, canvas, …): user grants, organization grants, and public access,
 * across three tabs, plus an email-me-the-link action. The window refuses to
 * render without a valid resource type + id, so resource identity is
 * guaranteed while the surface exists; permission data loads asynchronously
 * via `useSharing`. Access-management widget — no text/content concept, so
 * generic baselines are skipped. Emitter: nested SurfaceRuntimeProvider
 * inside `ShareModalWindow` (wired 2026-08-09).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const SHARE_SURFACE_NAME = "matrx-user/share";

const groups: SurfaceValueGroup[] = [
  {
    key: "shared_resource",
    label: "Shared resource",
    sortOrder: 100,
    description: "The resource whose access is being managed.",
  },
  {
    key: "access_state",
    label: "Access state",
    sortOrder: 200,
    description:
      "Current grants on the resource and where the user is in the sharing UI.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Shared resource ───────────────────────────────────────────────────
  {
    name: "resource_type",
    label: "Resource type",
    description:
      "Type of the resource being shared (note, task, cx_conversation, cld_files, canvas, …). Always present — the window refuses to render without it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 300,
    group: "shared_resource",
  },
  {
    name: "resource_id",
    label: "Resource ID",
    description:
      "UUID of the resource being shared. Always present — the window refuses to render without it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "shared_resource",
  },
  {
    name: "resource_name",
    label: "Resource name",
    description:
      "Display name of the resource being shared, as shown in the window title. Always populated while the window is mounted (may be an empty string when the opener had no name).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "shared_resource",
  },
  {
    name: "share_url",
    label: "Share URL",
    description:
      "Canonical in-app URL for the resource (what the email-link action sends). Always derivable while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 330,
    group: "shared_resource",
  },

  // ── Access state ──────────────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which sharing tab is open: "users", "organizations", or "public". Always populated while the window is mounted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 13,
    sortOrder: 400,
    group: "access_state",
  },
  {
    name: "is_owner",
    label: "User owns resource",
    description:
      "True when the current user owns the resource (and may therefore grant/revoke access). Absent while the ownership check is still loading.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "access_state",
  },
  {
    name: "is_public",
    label: "Resource is public",
    description:
      "True when the resource has an active public-access grant. Absent while permissions are still loading.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "access_state",
  },
  {
    name: "user_grant_count",
    label: "User grant count",
    description:
      "Number of individual-user permission grants on the resource. Absent while permissions are still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 430,
    group: "access_state",
  },
  {
    name: "org_grant_count",
    label: "Organization grant count",
    description:
      "Number of organization permission grants on the resource. Absent while permissions are still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 440,
    group: "access_state",
  },
  {
    name: "permissions",
    label: "Permission grants",
    description:
      "Every permission grant on the resource (user, org, and public entries with their access levels). Absent while loading. Bindable-only — resolvable and potentially long.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 450,
    group: "access_state",
  },
];

export const shareManifest: SurfaceManifest = {
  surfaceName: SHARE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired 2026-08-09 (nested SurfaceRuntimeProvider inside ShareModalWindow — resource identity, share URL, active tab, and post-load grant state at Run time). Needs the live browser pass to earn verified.",
  overlayId: "shareModalWindow",
  label: "Share",
  intro: `<surface_intro>
You are in the Share window — the user is managing who can access ONE resource (a note, task, chat, file, …) across three tabs: individual users, organizations, and public access. Shared resource identifies exactly what is being shared and its canonical URL; Access state tells you the current grants and which tab the user is on. Only the owner may change access — respect is_owner before proposing grant/revoke actions.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Access-management widget — no text/content/selection concept.
  skipBaselineValues: true,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createShareScope(values: {
  resource_type: string;
  resource_id: string;
  resource_name: string;
  share_url: string;
  active_tab: "users" | "organizations" | "public";
  is_owner?: boolean;
  is_public?: boolean;
  user_grant_count?: number;
  org_grant_count?: number;
  permissions?: Array<Record<string, unknown>>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
