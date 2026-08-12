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
 * any moment.
 *
 * Emitters: `FeedbackManagementContainer` mounts the surface's only
 * `SurfaceRuntimeProvider` and services both write targets. It reaches the
 * editors through `FeedbackConsoleEditorStore` — a page-scoped, ref-backed
 * registry the announcement dialogs and the categories tab publish their live
 * state and setters into. The triage table's and work queue's own row state is
 * still not bridged, so nothing about a specific feedback item is emitted —
 * see readinessNote.
 *
 * What an agent bound here may safely do: read which tab the admin is on, read
 * whichever announcement or category editor is open, and draft the COPY in it.
 * It must NOT assume any specific feedback item or queue item is loaded — none
 * of that is emitted today.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  ANNOUNCEMENT_TYPES,
  type AnnouncementType,
} from "@/types/feedback.types";
import {
  ANNOUNCEMENT_DRAFT_KEYS,
  ANNOUNCEMENT_MESSAGE_MAX_CHARS,
  ANNOUNCEMENT_TITLE_MAX_CHARS,
} from "@/features/admin/feedback/announcement-draft";
import {
  CATEGORY_DESCRIPTION_MAX_CHARS,
  CATEGORY_DRAFT_KEYS,
  CATEGORY_NAME_MAX_CHARS,
} from "@/features/admin/feedback/category-draft";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_FEEDBACK_SURFACE_NAME = "matrx-admin/feedback";

const groups: SurfaceValueGroup[] = [
  {
    key: "console",
    label: "Feedback console",
    sortOrder: 100,
    description: "Which of the four admin tabs the user is currently on.",
  },
  {
    key: "authoring",
    label: "Open editors",
    sortOrder: 200,
    description:
      "The announcement or category editor the admin currently has open, and the copy staged in it.",
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
  {
    name: "announcement_editor",
    label: "Open announcement editor",
    description:
      'The announcement dialog the admin has open, as { mode, announcement_id, title, message, announcement_type, is_saving }. `mode` is "create" for the new-announcement dialog (announcement_id null) or "edit" for an existing row. ABSENT when neither dialog is open — which is the normal state, because these are modal dialogs and an admin cannot type to you while one is on screen. Read this to see what is already staged before you replace it; `announcement_draft` never appends.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 200,
    group: "authoring",
  },
  {
    name: "category_editor",
    label: "Open category editor",
    description:
      'The inline feedback-category form on the Categories tab, as { mode, category_id, name, description, is_saving }. `mode` is "create" for the new-category form (category_id null) or "edit" for an existing category. ABSENT when no category form is open, and also whenever the admin is on another tab (the Categories tab unmounts).',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 210,
    group: "authoring",
  },
];

/**
 * The write half — TWO targets, and the reasoning for the lines they draw.
 *
 * WHAT AN AGENT MAY WRITE HERE: the copy, and only the copy. An announcement's
 * title and body are authored prose that reaches every user on their next
 * login, and a feedback category's name and description are the taxonomy
 * labels the whole triage table reads against — both are the textbook YES on
 * the judgment bar (authored content an agent drafts better and faster than a
 * person typing into a textarea).
 *
 * WHAT IT MAY NOT, and why each is a category rather than a preference:
 *
 *  - PUBLISHING. There is no `create_announcement`, no `save_announcement`, and
 *    no write for `is_active` — the switch that decides whether an announcement
 *    is SHOWN to users. An announcement goes out to real people and interrupts
 *    them at login; the agent drafts, the admin presses "Create Announcement" /
 *    "Save Changes". This is the same line `matrx-admin/email` drew at the Send
 *    button, `image-generate` drew at Generate, and `scraper` drew at running a
 *    scrape — copied here deliberately, and it is the reason both targets are
 *    `mode: "draft"` rather than `entity`: what actually happens is that a
 *    value lands in a form, and `entity` would be a false claim about that.
 *  - AUDIENCE AND DURATION. `min_display_seconds` is how many seconds every
 *    user is FORCED to stare at the announcement before they may dismiss it.
 *    That is not copy, it is an imposition on other people's time, and the same
 *    reasoning that keeps recipients off `matrx-admin/email` keeps it off this
 *    one. (This surface has no audience selector — announcements are global —
 *    but if one is ever added it belongs on this list, not in a target.)
 *  - FEEDBACK TRIAGE AND ROUTING. `status`, `priority`, `work_priority`,
 *    `admin_decision`, `assigned_to` and `category_id` on a feedback record are
 *    governance, not authoring: they decide whose queue a user's report lands
 *    in, whether it is approved or rejected, and how loudly it is escalated.
 *    An agent that can quietly mark a bug "wont_fix" or reassign it away from
 *    the admin who owns it is the exact write this campaign refuses. They stay
 *    undeclared.
 *  - IDS AND DERIVED KEYS. `announcement_id`, `category_id`, and the category
 *    `slug` (derived from the name on save when left blank) are identity, not
 *    copy. The colour and sort order are presentation nobody would ask an agent
 *    to pick.
 *  - CREATE AND DELETE. Deleting a feedback record destroys a user's report and
 *    deleting a category orphans every row filed under it. Delete stays human,
 *    always.
 *
 * WHY THE FEEDBACK-DETAIL FIELDS ARE NOT HERE, even though they are the most
 * agent-shaped copy on the page. `FeedbackDetailDialog` holds three genuinely
 * authored fields — `admin_direction` (instructions for the agent that will do
 * the work), `admin_notes` (internal triage notes), and a compose box for a
 * reply to the user — and a first pass at this surface would declare all three.
 * They are omitted on REACHABILITY, which is a correctness argument, not a
 * squeamish one: that dialog is a Radix modal, and a Radix modal sets
 * `pointer-events: none` on the body, so the floating agent chat cannot be
 * typed into while it is open. An admin therefore cannot open a feedback record
 * and then ask for help with it. The only way to make those targets live would
 * be for the handler to OPEN a feedback record itself — which means the agent
 * choosing WHICH user's report to act on, and that is record selection on the
 * admin's behalf, exactly what the mode gate below exists to prevent. A target
 * that can only ever fire into an already-open modal is correct-looking dead
 * code; better to say so here than to ship two of them. If the triage dialog
 * ever grows a non-modal path (a detail pane, a route), those three fields are
 * the first thing that should be added to this surface.
 *
 * WHY THE ANNOUNCEMENT FIELDS ARE ONE PARTIAL-PATCH OBJECT — the deliberate
 * call between the two precedents:
 *
 *  - `matrx-admin/email`'s `email_draft` (one object) is the right model, and
 *    `matrx-admin/tool-registry`'s three separate targets are not, because
 *    title, message and type are not independent decisions. They are ONE piece
 *    of copy: the title is the promise the message keeps, and the type is the
 *    severity that copy is written at — "critical" prose under an "info" icon
 *    is a mismatch nobody chose. The admin reviewing a draft wants to accept or
 *    reject the announcement, not a third of it, and the open dialog is the
 *    review unit exactly as the compose form is on the email surface.
 *  - It is also the ordering fix. When an agent stages several targets in one
 *    turn the seam resolves every handler closure BEFORE the first dialog is
 *    confirmed, so interdependent fields spread over three targets are read off
 *    the same (possibly stale) render. One object resolves all three atomically.
 *  - Partial-patch keeps the fine-grained ask that separate targets would have
 *    bought: "make the title punchier" sends `{ title }` alone and the message
 *    is untouched, because an omitted key is never written.
 *
 * WHY CATEGORIES ARE A SECOND TARGET AND NOT MORE KEYS ON THE FIRST. The
 * opposite call, for the opposite reason: an announcement and a category
 * taxonomy entry are different objects, in different tabs, saved by different
 * buttons, and reviewed at different moments. Bundling them would produce a
 * confirm dialog describing two unrelated edits, and "Keep as is" would decline
 * work the admin wanted. Independent decisions, independently declinable — the
 * `matrx-admin/tool-registry` rule, applied where it actually holds.
 *
 * BOTH TARGETS ARE MODE-GATED, and that is the hard part of this surface. Four
 * tabs and two announcement dialogs mean "write the title" has no single
 * meaning. `resolveAnnouncementEditor` picks the edit dialog when it is open,
 * the create dialog otherwise, and REFUSES when both are open rather than
 * guessing which announcement the admin meant. Every guard is read from the
 * ref-backed registry at call time, never from the render closure the seam
 * captured before the confirm — see `FeedbackConsoleEditorStore` for why.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "announcement_draft",
    label: "Announcement draft",
    description:
      `Stages announcement COPY into the announcement dialog the admin is looking at. Nothing is published and no user sees anything — the admin still presses "Create Announcement" or "Save Changes", and that press is never an agent action. ` +
      `If the Edit Announcement dialog is open, this writes into THAT existing announcement. If neither dialog is open, this OPENS the "Create New Announcement" dialog and stages a new draft in it (opening a form creates nothing and is reversible). If BOTH dialogs are somehow open it is refused, because there is no single announcement to mean. ` +
      `Value: an object with AT LEAST ONE of { ${ANNOUNCEMENT_DRAFT_KEYS.join(", ")} }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (nothing here appends — read the current draft back from \`announcement_editor\` first if you mean to extend rather than replace). ` +
      `\`title\` — the heading on the announcement card; a non-empty plain-text string, ONE line only, at most ${ANNOUNCEMENT_TITLE_MAX_CHARS} characters. ` +
      `\`message\` — the body; a non-empty string, at most ${ANNOUNCEMENT_MESSAGE_MAX_CHARS} characters. Real newlines are fine and are preserved as written. This is PLAIN TEXT with exactly ONE markup affordance: a markdown LINK, \`[link text](https://example.com)\`, and bare http/https URLs auto-link. Nothing else is parsed — \`**bold**\`, \`# headings\` and \`- bullets\` render as literal asterisks, hashes and hyphens, so write prose, not markdown. ` +
      `\`announcement_type\` — the severity the card is styled and iconed at; exactly one of ${ANNOUNCEMENT_TYPES.join(" | ")}. ` +
      `Send the text fields as plain text, not JSON and not JSON-encoded. ` +
      `NOT writable here: whether the announcement is ACTIVE (shown to users), how many seconds users are forced to read it before they may dismiss it, publishing or saving it, and deleting it. If the admin asks you to send or activate an announcement, draft it and say that they publish it themselves. ` +
      `Refused while that dialog is saving — a submit is already in flight against the OLD copy.`,
    valueType: "object",
    updatesValue: "announcement_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 300,
  },
  {
    name: "category_draft",
    label: "Feedback category draft",
    description:
      `Stages COPY into the inline feedback-category form on the Categories tab. Nothing is saved — the admin still presses Save, and the category taxonomy is what every feedback row is filed against. ` +
      `Requires the admin to be on the CATEGORIES tab (the tab unmounts its form when another tab is showing); it is refused otherwise with a message saying so, because staging into an unmounted form would write into nothing. If a category form is already open — new or existing — this patches THAT one; if none is open it starts a NEW category draft and switches to the "Manage Categories" view so the staged copy is visible. ` +
      `Value: an object with AT LEAST ONE of { ${CATEGORY_DRAFT_KEYS.join(", ")} }. Each key REPLACES that whole field; omit a key to leave it as the admin left it (nothing appends — read \`category_editor\` first if you mean to extend). ` +
      `\`name\` — the category label, rendered as a badge on every feedback row filed under it; a non-empty plain-text string, ONE line only, at most ${CATEGORY_NAME_MAX_CHARS} characters. ` +
      `\`description\` — what belongs in this category; a non-empty plain-text string, at most ${CATEGORY_DESCRIPTION_MAX_CHARS} characters. Plain text, no markup is parsed. ` +
      `Send both as plain text, not JSON and not JSON-encoded. ` +
      `NOT writable here: the URL slug (derived from the name on save), the badge colour, sort order, whether the category is active, and deleting a category — deleting one orphans every feedback row filed under it. ` +
      `Refused while the form is saving.`,
    valueType: "object",
    updatesValue: "category_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 310,
  },
];

export const adminFeedbackManifest: SurfaceManifest = {
  surfaceName: ADMIN_FEEDBACK_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + FeedbackManagementContainer emitter wired (the container mounts the surface's only SurfaceRuntimeProvider and services both write targets through the page-scoped FeedbackConsoleEditorStore registry). Remaining: the feedback triage table and work queue still emit nothing about a specific feedback item — FeedbackTable/WorkQueueTab hold their row and detail-dialog state privately and are not bridged into the registry, so the authored fields inside FeedbackDetailDialog (admin_direction, admin_notes, the user-reply compose box) are neither readable nor writable; that dialog is also a modal, which makes those targets unreachable from the agent chat today (see the writeTargets docblock). Also: no `data-surface-value` anchors, and no DB mirror of writeTargets.",
  label: "Feedback & Announcements",
  urlPattern: "/administration/users/feedback",
  intro: `<surface_intro>
This is an ADMIN surface: the Feedback & Announcements console at /administration/users/feedback, a 4-tab admin tool over user-submitted feedback (bugs/features/suggestions), the AI-agent work queue built from that feedback, system announcements, and the feedback category taxonomy.

active_tab tells you which of the four tabs the admin is looking at right now — "feedback" is the full triage table, "work-queue" is the priority-ordered queue agents pull from, "announcements" and "categories" are their own CRUD tabs.

announcement_editor and category_editor appear only when the admin has one of those editors open, and carry the copy currently staged in it.

What you may safely do: draft the COPY. announcement_draft puts a title, message and severity into the announcement dialog (opening the create dialog if none is open); category_draft puts a name and description into the Categories tab's inline form. You never publish, activate, save or delete anything — the admin presses those buttons — and you never touch a feedback record's status, priority, decision, assignee or category: none of those have a write target here.

Nothing about a specific feedback item or queue entry is in scope — reason about those at the level of "what tab is the admin working in" until this surface's emitter is extended.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** The open announcement dialog, as `announcement_editor` reports it. */
export interface AdminFeedbackAnnouncementEditorValue {
  mode: "create" | "edit";
  announcement_id: string | null;
  title: string;
  message: string;
  announcement_type: AnnouncementType;
  is_saving: boolean;
}

/** The open inline category form, as `category_editor` reports it. */
export interface AdminFeedbackCategoryEditorValue {
  mode: "create" | "edit";
  category_id: string | null;
  name: string;
  description: string;
  is_saving: boolean;
}

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
  announcement_editor?: AdminFeedbackAnnouncementEditorValue;
  category_editor?: AdminFeedbackCategoryEditorValue;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
