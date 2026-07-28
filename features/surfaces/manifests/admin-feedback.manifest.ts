/**
 * Surface manifest — Feedback & Announcements admin (`matrx-admin/feedback`).
 *
 * ADMIN SURFACE. Adopts an EXISTING `ui_surface` row name — this manifest
 * must sync onto it, not create a new one. Drives
 * `/administration/users/feedback` (`app/(admin)/administration/users/feedback/page.tsx`
 * → `FeedbackManagementContainer.tsx`), a 4-tab admin console over
 * `types/feedback.types.ts#UserFeedback` records read/written via
 * `actions/feedback.actions.ts`:
 *
 *   - `feedback`      FeedbackTable — the full triage table (search, status,
 *                      type, category, admin decision, priority)
 *   - `work-queue`     WorkQueueTab — the AI-agent work queue, priority-ordered
 *   - `announcements`  AnnouncementTable — system announcements CRUD
 *   - `categories`      CategoriesTab — feedback category taxonomy CRUD
 *
 * The active tab is a `?tab=` query param (URL-driven — see `activeTab` in
 * `FeedbackManagementContainer.tsx`), so `active_tab` is reliably knowable at
 * any moment. Each tab's own list/detail state (the feedback rows, the queue
 * items, the announcements, the categories) is separate client state per
 * child component with NO current cross-component bridge, so nothing below
 * that state is declared yet — see readinessNote.
 *
 * What an agent bound here may safely do: read which tab the admin is on and
 * reason about triage/prioritization/categorization decisions in general. It
 * must NOT assume any specific feedback item, queue item, announcement, or
 * category is loaded — none of that is emitted today.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_FEEDBACK_SURFACE_NAME = "matrx-admin/feedback";

const groups: SurfaceValueGroup[] = [
  {
    key: "console",
    label: "Feedback console",
    sortOrder: 100,
    description: "Which of the four admin tabs the user is currently on.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which tab of the Feedback & Announcements console is showing: "feedback" (triage table), "work-queue" (AI agent queue), "announcements", or "categories". Driven by the `?tab=` URL param; defaults to "feedback" when absent. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 100,
    group: "console",
  },
];

export const adminFeedbackManifest: SurfaceManifest = {
  surfaceName: ADMIN_FEEDBACK_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired. FeedbackManagementContainer.tsx knows the active tab from the URL but has no SurfaceRuntimeProvider. Each tab's list/detail state (feedback rows, work-queue items, announcements, categories) lives in separate child components (FeedbackTable, WorkQueueTab, AnnouncementTable, CategoriesTab) with no shared scope today — declaring those values would promise data no emitter supplies, so only active_tab is declared for now.",
  label: "Feedback & Announcements",
  urlPattern: "/administration/users/feedback",
  intro: `<surface_intro>
This is an ADMIN surface: the Feedback & Announcements console at /administration/users/feedback, a 4-tab admin tool over user-submitted feedback (bugs/features/suggestions), the AI-agent work queue built from that feedback, system announcements, and the feedback category taxonomy.

active_tab tells you which of the four tabs the admin is looking at right now — "feedback" is the full triage table, "work-queue" is the priority-ordered queue agents pull from, "announcements" and "categories" are their own CRUD tabs.

Nothing about a specific feedback item, queue entry, announcement, or category is in scope yet — reason at the level of "what tab is the admin working in" until this surface's emitter is extended.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminFeedbackScope(values: {
  // alwaysAvailable: true → required
  active_tab: "feedback" | "work-queue" | "announcements" | "categories";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
