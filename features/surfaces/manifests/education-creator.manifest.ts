/** Creator profile editor (`matrx-user/education-creator`). */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_CREATOR_SURFACE_NAME = "matrx-user/education-creator";

const groups: SurfaceValueGroup[] = [
  { key: "profile", label: "Creator profile", sortOrder: 100 },
  { key: "state", label: "Page state", sortOrder: 200 },
];

const values: SurfaceValue[] = [
  {
    name: "creator_profile",
    label: "Creator profile",
    description: "The caller's persisted creator profile as { handle, display_name, tagline, bio, links, is_public, published_at }. Null when a handle has not been claimed or while the profile is unavailable.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2400,
    inlineUpTo: 3000,
    group: "profile",
    sortOrder: 100,
  },
  {
    name: "creator_profile_loading",
    label: "Profile loading",
    description: "True while the creator profile is loading. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "state",
    sortOrder: 200,
  },
  {
    name: "creator_profile_error",
    label: "Profile error",
    description: "The profile load error shown by the page. Absent after a successful load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "state",
    sortOrder: 210,
  },
  {
    name: "active_organization_id",
    label: "Active workspace ID",
    description: "The organization in which a new creator profile will be claimed. Null means no workspace is selected; the canonical claim path will ask the person to choose one if the profile must be created.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "state",
    sortOrder: 220,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "claim_creator_profile",
    label: "Claim creator profile",
    description: "Creates the caller's creator profile by claiming a public handle immediately after approval. Value is { handle: string, display_name?: string }. handle must be 3-30 lowercase letters, numbers, or dashes and is checked by the canonical claim path for availability and reserved names. The active workspace is carried to the canonical RPC only for a missing profile row.",
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    updatesValue: "creator_profile",
    group: "profile",
    sortOrder: 300,
  },
  {
    name: "update_creator_profile",
    label: "Update creator profile",
    description: "Updates the caller's existing creator identity immediately after approval. Value is { display_name?: string, tagline?: string, bio?: string, links?: [{ label: string, url: string }] }. Send only fields to change. This does not change handle, featured resources/classes/videos, payouts, or permissions.",
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    updatesValue: "creator_profile",
    group: "profile",
    sortOrder: 310,
  },
  {
    name: "set_creator_page_visibility",
    label: "Publish creator page to the web",
    description: "Publishes or unpublishes the caller's existing creator page immediately after approval. Value is { is_public: boolean }. Unpublishing removes the public landing page but retains the profile and its content; it does not delete anything.",
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    updatesValue: "creator_profile",
    group: "profile",
    sortOrder: 320,
  },
];

export const educationCreatorManifest: SurfaceManifest = {
  surfaceName: EDUCATION_CREATOR_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description: "Authenticated creator profile editor at /education/creator.",
  readiness: "partial",
  readinessNote: "Manifest, route mapping, scope, and canonical create/update/publish handlers are implemented. Focused mirror sync and live agent interaction proof remain required.",
  label: "Creator profile",
  urlPattern: "/education/creator",
  intro: `<surface_intro>
You are on Creator Profile, where the person claims a public creator handle and maintains the identity shown at that public page. creator_profile is the persisted profile. claim_creator_profile creates it, update_creator_profile changes identity text and external links, and set_creator_page_visibility publishes or unpublishes it after approval. Do not change payouts, permissions, a handle, or featured resources/classes/videos here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
  agentRosterMode: "universal",
};

export function createEducationCreatorScope(values: {
  creator_profile_loading: boolean;
  creator_profile?: unknown;
  creator_profile_error?: string;
  active_organization_id?: string;
}): SurfaceScopePayload {
  return {
    ...values,
    runtime: { surfaceName: EDUCATION_CREATOR_SURFACE_NAME },
  };
}
