/** Surface manifest — Family (`matrx-user/education-family`).
 *
 * `/education/family` manages the consented guardian-to-learner relationship.
 * Every mutation goes through the existing `guardian_*` SECURITY DEFINER doors
 * in `familyService`; no direct table access, security grant, or admin lane is
 * introduced here. `/education/family/[studentId]` is a linked learner's
 * read-only progress view and exposes no write handlers.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup, SurfaceWriteTarget } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "family_view", label: "Family view", sortOrder: 100, description: "The current Family route." },
  { key: "guardian_links", label: "Guardian links", sortOrder: 200, description: "Current consented links and pending requests returned by the caller-scoped guardian_list_links door." },
  { key: "linked_progress", label: "Linked learner progress", sortOrder: 300, description: "Read-only progress for one learner whose active link was checked by the route and every data RPC." },
];

const surfaceSpecific: SurfaceValue[] = [
  { name: "view", label: "Current view", description: '"dashboard" manages guardian links; "student_progress" is a read-only linked learner detail.', valueType: "string", alwaysAvailable: true, typicalCharCount: 16, sortOrder: 100, group: "family_view" },
  { name: "family_links_loading", label: "Links loading", description: "True while current guardian links and requests are loading. Do not infer an empty list while true.", valueType: "boolean", alwaysAvailable: false, typicalCharCount: 5, sortOrder: 200, group: "guardian_links" },
  { name: "family_links_error", label: "Links load error", description: "The visible error when the current user's guardian links could not load. Absent on a successful load.", valueType: "string", alwaysAvailable: false, typicalCharCount: 120, sortOrder: 210, group: "guardian_links" },
  { name: "linked_learners", label: "Linked learners", description: "Active guardian-side links, each { id, counterpart_user_id, counterpart_email, relationship, status, verified_at }. `counterpart_user_id` opens the read-only progress page; only active links appear here.", valueType: "array", alwaysAvailable: false, typicalCharCount: 1000, inlineUpTo: 3000, sortOrder: 220, group: "guardian_links" },
  { name: "sent_guardian_requests", label: "Requests sent", description: "Pending guardian-side requests, each { id, counterpart_user_id, counterpart_email, status }. They do not grant access until a learner approves them. Their ids can be unlinked to cancel.", valueType: "array", alwaysAvailable: false, typicalCharCount: 700, sortOrder: 230, group: "guardian_links" },
  { name: "guardian_requests_for_me", label: "Requests awaiting my decision", description: "Pending requests where the current user is the learner, each { id, counterpart_user_id, counterpart_email, status }. Use update_guardian_requests with its id and approve true or false; approval changes who may read this learner's progress.", valueType: "array", alwaysAvailable: false, typicalCharCount: 700, sortOrder: 240, group: "guardian_links" },
  { name: "linked_student_id", label: "Linked learner id", description: "The learner whose progress is open on the read-only detail route. Absent on the guardian-link dashboard.", valueType: "string", alwaysAvailable: false, typicalCharCount: 36, sortOrder: 300, group: "linked_progress" },
  { name: "linked_student_label", label: "Linked learner", description: "The visible label of the learner whose read-only progress is open. Absent on the guardian-link dashboard.", valueType: "string", alwaysAvailable: false, typicalCharCount: 60, sortOrder: 310, group: "linked_progress" },
  { name: "linked_progress_loading", label: "Progress loading", description: "True while linked learner analytics are loading. Absent on the guardian-link dashboard.", valueType: "boolean", alwaysAvailable: false, typicalCharCount: 5, sortOrder: 320, group: "linked_progress" },
  { name: "linked_progress_error", label: "Progress load error", description: "The visible error when linked learner analytics could not load. Absent on a successful read and on the guardian-link dashboard.", valueType: "string", alwaysAvailable: false, typicalCharCount: 120, sortOrder: 330, group: "linked_progress" },
];

const writeTargets: SurfaceWriteTarget[] = [
  { name: "create_guardian_requests", label: "Request learner access", description: "Saves a request for guardian access immediately, pending the learner's approval. Value is a JSON ARRAY of 1-25 { student_email: string }. The response is deliberately neutral and never reveals whether an account exists. This changes a potential access relationship and always requires the person's approval.", valueType: "array", mode: "entity", applyPolicy: "ask", updatesValue: "sent_guardian_requests", group: "guardian_links", sortOrder: 100 },
  { name: "create_guardian_grants", label: "Grant guardian access", description: "Saves a learner's direct guardian grant immediately. Value is a JSON ARRAY of 1-25 { guardian_email: string }. The response is deliberately neutral and never reveals whether an account exists. A successful grant can give a guardian read access to this learner's progress, so it always requires the person's approval.", valueType: "array", mode: "entity", applyPolicy: "ask", updatesValue: "linked_learners", group: "guardian_links", sortOrder: 110 },
  { name: "update_guardian_requests", label: "Approve or decline guardian requests", description: "Decides pending requests addressed to this learner. Value is a JSON ARRAY of 1-25 { id: string, approve: boolean }, using an id from guardian_requests_for_me. approve: true gives that guardian access to the learner's progress; false declines it. Each decision is saved immediately only after the person's approval.", valueType: "array", mode: "entity", applyPolicy: "ask", updatesValue: "guardian_requests_for_me", group: "guardian_links", sortOrder: 120 },
  { name: "delete_guardian_links", label: "Unlink guardian relationships", description: "Removes an existing guardian relationship or cancels a pending request. Value is a JSON ARRAY of 1-25 ids (or { id }) from linked_learners, sent_guardian_requests, or guardian_requests_for_me. This immediately removes current or requested guardian access and always requires the person's approval.", valueType: "array", mode: "entity", applyPolicy: "ask", updatesValue: "linked_learners", group: "guardian_links", sortOrder: 130 },
];

export const educationFamilyManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-family",
  client: "matrx-user",
  executionMode: "python-stream",
  description: "Guardian and learner consent management, plus read-only linked learner progress.",
  readiness: "partial",
  readinessNote: "Source registration and runtime context are implemented. No DB mirror sync or live agent probe has been run. The linked learner detail is read-only by design.",
  label: "Family",
  urlPattern: "/education/family",
  intro: `<surface_intro>
You are on Family. On the dashboard, linked_learners, sent_guardian_requests, and guardian_requests_for_me are the caller's current links from the canonical guardian_list_links door. Check family_links_loading and family_links_error before acting.
Guardian requests and learner grants can change who may read a learner's progress. Use the four declared targets only when the person has clearly asked, and each always needs their approval. The server re-checks that the caller is a party to every response or unlink.
On student_progress, the linked learner's analytics are read-only. Do not attempt to change any link or progress from that route.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface FamilyLinkEntry {
  id: string;
  counterpart_user_id: string;
  counterpart_email: string;
  relationship: string | null;
  status: string;
  verified_at: string | null;
}

export function createEducationFamilyScope(values: {
  view: "dashboard" | "student_progress";
  selection?: string;
  context?: Record<string, unknown>;
  family_links_loading?: boolean;
  family_links_error?: string;
  linked_learners?: FamilyLinkEntry[];
  sent_guardian_requests?: FamilyLinkEntry[];
  guardian_requests_for_me?: FamilyLinkEntry[];
  linked_student_id?: string;
  linked_student_label?: string;
  linked_progress_loading?: boolean;
  linked_progress_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
