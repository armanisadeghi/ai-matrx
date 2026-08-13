/**
 * Surface manifest — Study guide authoring (`matrx-user/education-learn-authoring`).
 *
 * The `/education/learn/admin` route: the super-admin authoring surface for the
 * DB-backed `/education/learn` publishing engine (`education.learn_doc`). It is
 * a list of every study guide including drafts, plus an editor for ONE guide —
 * its slug, title, summary, subject, badge, updated date, keywords, the article
 * body as `EduSection[]` JSON, and its `related` cross-links — with a live
 * `SectionRenderer` preview of exactly what the public page will render.
 *
 * WHY THIS IS NOT `matrx-user/education-learn`
 *
 * `route-to-surface.ts` maps the whole `/education/learn` prefix to
 * `matrx-user/education-learn` — a name with no manifest and no mount anywhere
 * in the repo, i.e. a name lookup rather than a surface. That prefix covers
 * THREE pages: the public index (`/education/learn`), the public article
 * (`/education/learn/[...slug]`), and this authoring page. The public two are
 * anonymous, server-rendered marketing/reader pages — a rendered article and
 * nothing to edit. This page has no rendered article at all; it has a draft
 * list, an open editor, and validation state.
 *
 * They share no vocabulary, and different agents act on them: a "explain this
 * passage" or "what should I read next" agent belongs on the reader, while a
 * content-drafting agent belongs here. Claiming `education-learn` for the
 * authoring vocabulary would hand every agent run on a PUBLIC article an
 * authoring manifest promising `draft_title` / `draft_sections` the reader
 * cannot supply, plus four write targets with no handlers behind them — which
 * fails loudly at apply time by design. So this is its own surface, resolved by
 * a regex ABOVE the prefix loop in `route-to-surface.ts` (the same split the
 * `analysis-studio` and `education-flashcard-editor` surfaces use). The public
 * reader surface is left exactly as it was: still manifest-less, still unmounted
 * — authoring it is real work, and honestly a separate job.
 *
 * WHY THE WRITE TARGETS ARE `draft`, NOT `entity`
 *
 * These docs publish to the PUBLIC WEB. `saveLearnDocAction` busts the
 * `education-learn-docs` cache tag, so persisting a rewrite of an
 * already-published guide puts it in front of real readers with no deploy and
 * no further human step. Publication is the human's call, so every target here
 * stages into the editor's own React state — the same setters the admin's
 * typing drives. The staged draft re-renders in the live preview, and the human
 * still presses "Save draft" or "Save & publish". Persistence therefore keeps
 * flowing through the one canonical path (`saveLearnDocAction` → the
 * super-admin `edu_learn_doc_upsert` RPC); nothing here opens a second one.
 *
 * Curated groups (band 0-899):
 *
 *   library          Every guide in the library, incl. drafts, and its counts
 *   editor           Which guide is open for editing, and in what mode
 *   doc_content      The staged draft fields — the nine editor inputs
 *   authoring_state  Live JSON validation + preview chrome
 *
 * Emitter + write handlers:
 * `features/education/publishing/components/LearnDocAdmin.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library",
    label: "Guide library",
    sortOrder: 100,
    description:
      "Every study guide the authoring list shows, drafts included, with the published/total counts in the header.",
  },
  {
    key: "editor",
    label: "Editor",
    sortOrder: 200,
    description:
      "Whether a guide is open for editing, which one, and whether it is a new guide or an existing one.",
  },
  {
    key: "doc_content",
    label: "Guide draft",
    sortOrder: 300,
    description:
      "The staged content of the guide currently open in the editor — what the inputs hold right now, saved or not.",
  },
  {
    key: "authoring_state",
    label: "Authoring state",
    sortOrder: 400,
    description:
      "Live validation of the two JSON fields plus the preview toggle — the editor's own chrome, not guide content.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Guide library ─────────────────────────────────────────────────────
  {
    name: "doc_count",
    label: "Guide count",
    description:
      "How many study guides exist in total, drafts included, matching the 'N total' header. Zero before the first guide is created. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "library",
  },
  {
    name: "published_count",
    label: "Published count",
    description:
      "How many of those guides are live on the public web (visibility 'public'), matching the 'N published' header. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "library",
  },
  {
    name: "learn_docs",
    label: "Study guides",
    description:
      "Every guide in the library as { id, slug, title, subject, status, updated }, in the list's own order. `status` is 'published' or 'draft'. Empty array when no guides exist. Always present — read it to get the `id` or slug of a guide before asking the admin to open it.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2400,
    sortOrder: 320,
    group: "library",
  },

  // ── Editor ────────────────────────────────────────────────────────────
  {
    name: "editor_open",
    label: "Editor open",
    description:
      "True when a guide is open in the editor, false on the library list. Always present. Check it first: every write target on this surface stages into the open editor, so they all refuse while it is false.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "editor",
  },
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      "'new' when the editor holds a guide that has never been saved, 'edit' when it holds an existing one. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 410,
    group: "editor",
  },
  {
    name: "editor_doc_id",
    label: "Editing guide ID",
    description:
      "UUID of the guide open in the editor. Absent while `editor_open` is false, and absent for a new guide that has no row yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "editor",
  },
  {
    name: "editor_doc_status",
    label: "Editing guide status",
    description:
      "Publication status of the guide open in the editor as last saved — 'published' means it is LIVE on the public web right now, so staged edits will go public the moment the admin saves. Absent while `editor_open` is false and for an unsaved new guide.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 430,
    group: "editor",
  },

  // ── Guide draft ───────────────────────────────────────────────────────
  {
    name: "draft_metadata",
    label: "Guide metadata",
    description:
      "The guide's SEO header as one object — { title, summary, subject, letter, keywords } — exactly as those five inputs hold it, staged and unsaved included. `subject` is null when left empty, `keywords` is an array (empty when the field is blank). Absent while `editor_open` is false. This is the read twin of the `doc_metadata` write target.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 500,
    group: "doc_content",
  },
  {
    name: "draft_slug",
    label: "Slug",
    description:
      "The guide's URL path under /education/learn, as shown in the Slug input; may contain '/' for hierarchy (e.g. 'biology/photosynthesis'). Empty on a new guide before the admin types one. Absent while `editor_open` is false. Read-only to agents — see the manifest's write-target notes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 510,
    group: "doc_content",
  },
  {
    name: "draft_title",
    label: "Title",
    description:
      "The guide's headline, as shown in the Title input — the public <h1> and the SEO title. Empty on a new guide. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 520,
    group: "doc_content",
  },
  {
    name: "draft_summary",
    label: "Summary",
    description:
      "The guide's short summary, as shown in the Summary textarea. It is used verbatim as the meta description AND the hero lede on the public page. Empty on a new guide. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 530,
    group: "doc_content",
  },
  {
    name: "draft_subject",
    label: "Subject",
    description:
      "The subject slug this guide belongs to (e.g. 'biology'), as shown in the Subject input — it links the article back to its subject page. Empty when the admin has left it blank. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 540,
    group: "doc_content",
  },
  {
    name: "draft_letter",
    label: "Badge",
    description:
      "The 1-2 character badge shown on cards and OG images for this guide (e.g. 'Bi'), as held by the Badge input. Defaults to 'Lr'. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 550,
    group: "doc_content",
  },
  {
    name: "draft_updated",
    label: "Updated",
    description:
      "The author-controlled content date shown to readers as 'Updated', in YYYY-MM-DD form, as held by the Updated input. Empty when the admin has not set one, in which case the row's own updated_at is displayed instead. Absent while `editor_open` is false.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 560,
    group: "doc_content",
  },
  {
    name: "draft_keywords",
    label: "Keywords",
    description:
      "The guide's SEO keywords as a string array, parsed from the comma-separated Keywords input. Empty array when the field is blank. Absent while `editor_open` is false.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 570,
    group: "doc_content",
  },
  {
    name: "draft_sections",
    label: "Sections",
    description:
      "The article body as the parsed `EduSection[]` the Sections textarea currently holds — the whole content of the guide, in render order. Each entry is one section block whose `kind` is 'prose', 'feature-grid', 'steps', 'status-cards', 'stat-bar', 'faq', or 'cta'. Absent while `editor_open` is false, and absent while the textarea holds invalid JSON (in which case `sections_error` says why). This is the read twin of the `doc_sections` and `add_sections` write targets — read it before replacing the body so you keep what should survive.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 580,
    group: "doc_content",
  },
  {
    name: "draft_related",
    label: "Related",
    description:
      "The guide's conversion cross-links as the parsed object the Related textarea holds — { tools?, subjects?, exams? }, each a slug array — driving which app tools and hub pages the article funnels into. Absent while `editor_open` is false, and while the textarea holds invalid JSON (see `related_error`). This is the read twin of the `doc_related` write target.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 590,
    group: "doc_content",
  },

  // ── Authoring state ───────────────────────────────────────────────────
  {
    name: "sections_error",
    label: "Sections error",
    description:
      "The validation message shown under the Sections field when its JSON is malformed or a section has an unknown kind. Absent whenever the sections JSON is valid — which is the normal case.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 600,
    group: "authoring_state",
  },
  {
    name: "related_error",
    label: "Related error",
    description:
      "The validation message shown under the Related field when its JSON is malformed or is not an object. Absent whenever the related JSON is valid.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 610,
    group: "authoring_state",
  },
  {
    name: "preview_visible",
    label: "Live preview",
    description:
      "True when the editor's live preview pane is showing (the default), false when the admin has collapsed it. Absent while `editor_open` is false. Bindable-only — it tells an agent whether the human can currently SEE a staged draft, not anything about the guide.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    autoContext: false,
    sortOrder: 620,
    group: "authoring_state",
  },
];

/**
 * Write targets. The judgment bar: this is the `/learn` CONTENT ENGINE, and
 * near enough everything on the page is authored prose an agent drafts better
 * and faster than a human — the headline, the summary that becomes the meta
 * description, the SEO keywords, the cross-links, and above all the article
 * body itself. That is the whole reason the surface earns targets.
 *
 * All four are `mode: "draft"` on `applyPolicy: "ask"`: they stage into the
 * editor's own state through the same setters the admin's typing drives, the
 * live preview re-renders them with the real `SectionRenderer`, and the admin
 * still presses Save. See the file header for why draft — not entity — is the
 * required choice on a surface that publishes to the public web.
 *
 * Deliberately NOT targets:
 *   • `slug` — the guide's IDENTITY and its public URL. Changing it on a
 *     published guide silently breaks every inbound link and search result
 *     pointing at the old path. An agent can suggest one in conversation; only
 *     the admin types it.
 *   • publish / unpublish — shipping content to the public web is the human's
 *     call, and the editor's own Save & publish button is where it is made.
 *   • delete — destructive, stays human.
 *   • the Updated date — it exists to tell readers when the CONTENT genuinely
 *     changed; letting an agent stamp it is a claim about the world, not
 *     authored content.
 *   • `preview_visible` — a mechanical toggle nobody asks an agent to flip.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "doc_metadata",
    label: "Guide metadata",
    description:
      "Set the open guide's title, summary, subject, badge and/or keywords. Value: { title?: string, summary?: string, subject?: string, letter?: string, keywords?: string[] } — provide at least one; omitted fields keep what the editor already holds, and an empty string clears `subject`. `summary` is used verbatim as the public meta description AND the hero lede, so write one sentence that works as both. `letter` is the 1-2 character card badge. `keywords` must be an ARRAY of strings, not a comma-separated string. Every text field is a PLAIN TEXT string — not JSON, not JSON-encoded, no code fence, no surrounding quotes. Stages into the editor inputs; the admin still saves. Requires a guide open in the editor.",
    valueType: "object",
    updatesValue: "draft_metadata",
    mode: "draft",
    applyPolicy: "ask",
    group: "doc_content",
    sortOrder: 100,
  },
  {
    name: "doc_sections",
    label: "Guide body",
    description:
      "REPLACE the guide's entire article body. Value: a JSON ARRAY of section objects (the `EduSection[]` vocabulary) — pass the array itself, not a string containing JSON, and no code fence. Field names are checked, so use them EXACTLY: prose { heading?, body } · feature-grid { heading?, subheading?, items: [{ title, description }] } · steps { heading?, steps: [{ number, title, description }] } · status-cards { heading?, cards: [{ title, status, description? }] } where status is 'live' | 'beta' | 'coming-soon' | 'planned' · stat-bar { stats: [{ value, label }] } · faq { heading?, items: [{ q, a }] } — note `q`/`a`, NOT question/answer · cta { heading, body?, primary: { label, href } }. This REPLACES the FULL set — read `draft_sections` first and include every section that should survive, or use `add_sections` to append instead. Prose bodies are plain markdown text with real newlines. Stages into the Sections editor and the live preview; the admin still saves.",
    valueType: "array",
    updatesValue: "draft_sections",
    mode: "draft",
    applyPolicy: "ask",
    group: "doc_content",
    sortOrder: 110,
  },
  {
    name: "add_sections",
    label: "Add sections",
    description:
      "APPEND one or more new sections to the END of the guide's body, leaving everything already there untouched. Value: a JSON ARRAY of section objects in the same `EduSection[]` vocabulary as `doc_sections`, with the same exact field names (an FAQ section is { kind: 'faq', heading?, items: [{ q, a }] } — `q`/`a`, NOT question/answer) — pass the array itself, not a string containing JSON, and no code fence. Use this for 'add an FAQ' or 'add a worked example' so you never have to resend the whole article. Stages into the Sections editor and the live preview; the admin still saves.",
    valueType: "array",
    updatesValue: "draft_sections",
    mode: "draft",
    applyPolicy: "ask",
    group: "doc_content",
    sortOrder: 120,
  },
  {
    name: "doc_related",
    label: "Related links",
    description:
      "REPLACE the guide's conversion cross-links. Value: { tools?: string[], subjects?: string[], exams?: string[] } — pass the object itself, not a string containing JSON, and no code fence. Each array holds slugs (e.g. tools: ['flashcards'], subjects: ['biology'], exams: ['ap-biology']) that decide which app tools and hub pages the published article funnels readers into. This REPLACES the whole object — read `draft_related` first and include what should survive. Stages into the Related editor; the admin still saves.",
    valueType: "object",
    updatesValue: "draft_related",
    mode: "draft",
    applyPolicy: "ask",
    group: "doc_content",
    sortOrder: 130,
  },
];

export const educationLearnAuthoringManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-learn-authoring",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + the four write targets (doc_metadata, doc_sections, add_sections, doc_related) are shipped, DB-synced, and verified end-to-end against a live Badass Agent run on /education/learn/admin: ask-per-target, Apply landing visibly in the inputs and the live preview, decline staging nothing, an undeclared target refused, a handler throw reaching the agent verbatim, and a clean Error Inspector. Not yet stamped verified: no agent roles are declared, and the PUBLIC reader half of the /education/learn prefix (the index and the [...slug] article, still mapped to the manifest-less matrx-user/education-learn) has no surface of its own yet.",
  label: "Study guide authoring",
  urlPattern: "/education/learn/admin",
  intro: `<surface_intro>
You are on the study-guide AUTHORING page at /education/learn/admin — the super-admin editor behind the public /education/learn library. These are SEO study guides: long-form, free-to-read explainers that rank in search and funnel readers into the app. You are not on the public article, and you are not in a study session.
The page has two states. Check editor_open first. While it is false you are on the library list: learn_docs holds every guide including drafts, and there is nothing staged to write into — every write target here refuses until the admin opens a guide (or creates one). While it is true, one guide is open and the draft_* values are what its inputs hold RIGHT NOW, saved or not.
Writing is the point of this surface. doc_metadata sets the title, summary, subject, badge and keywords; doc_sections replaces the whole article body; add_sections appends to it; doc_related sets the cross-links. Drafting a guide from a topic, tightening a summary into a meta description that actually earns the click, or adding an FAQ section is exactly the work this surface exists for. Read draft_sections before replacing the body — doc_sections replaces the FULL set, so anything you leave out is gone from the draft.
Everything you write is STAGED, never published. It lands in the editor and the live preview, and the admin presses Save. Two things stay entirely theirs: the slug, because it is the guide's public URL and changing it breaks inbound links, and publishing itself. If editor_doc_status is 'published', the guide is live on the public web right now — say so plainly when you propose a rewrite, because the admin's next save ships it to real readers.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** One entry in `learn_docs`. */
export interface LearnDocSummary {
  id: string;
  slug: string;
  title: string;
  subject: string | null;
  status: string;
  updated: string;
}

/** The `draft_metadata` composite value (and the shape its write target mirrors). */
export interface LearnDocDraftMetadata {
  title: string;
  summary: string;
  subject: string | null;
  letter: string;
  keywords: string[];
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationLearnAuthoringScope(values: {
  // alwaysAvailable: true → required
  doc_count: number;
  published_count: number;
  learn_docs: LearnDocSummary[];
  editor_open: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  editor_mode?: string;
  editor_doc_id?: string;
  editor_doc_status?: string;
  draft_metadata?: LearnDocDraftMetadata;
  draft_slug?: string;
  draft_title?: string;
  draft_summary?: string;
  draft_subject?: string;
  draft_letter?: string;
  draft_updated?: string;
  draft_keywords?: string[];
  draft_sections?: unknown[];
  draft_related?: Record<string, unknown>;
  sections_error?: string;
  related_error?: string;
  preview_visible?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
