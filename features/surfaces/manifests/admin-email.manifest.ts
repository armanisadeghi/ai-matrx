/**
 * Surface manifest — Email Users admin (`matrx-admin/email`).
 *
 * ADMIN SURFACE. Adopts an EXISTING `ui_surface` row name — this manifest
 * must sync onto it, not create a new one. Drives
 * `/administration/users/email` (`app/(admin)/administration/users/email/page.tsx`,
 * a single client component `AdminEmailPage`) — a compose form that sends a
 * one-off email to either a hand-typed list of addresses or a set of
 * selected platform users, via `POST /api/admin/email`.
 *
 * What an agent bound here may safely do: read the compose form's current
 * subject/message/recipient-mode and help draft or refine the copy, pick a
 * template, or reason about who's selected. It must NOT assume the email has
 * been sent — sending is the admin pressing "Send Email"; `last_send_result`
 * only reflects the LAST attempt, not anything in flight or planned.
 *
 * SECURITY: no SMTP credentials, API keys, or the allowed-domain enforcement
 * logic are declared — `allowed_from_domains` is informational display text
 * only (what the config API returned), never a value an agent can bypass. The
 * same holds for the write half: `custom_from` is NOT a write target, so no
 * agent can propose the address this mail appears to come from.
 *
 * Emitters: `AdminEmailPage` (email/page.tsx) mounts the surface's first (and
 * only) `SurfaceRuntimeProvider`, publishing the scope below and servicing the
 * one write target — see readinessNote for what is still missing.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  EMAIL_BODY_MAX_CHARS,
  EMAIL_DRAFT_KEYS,
  EMAIL_SUBJECT_MAX_CHARS,
} from "@/features/admin/shared/email-compose-draft";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_EMAIL_SURFACE_NAME = "matrx-admin/email";

const groups: SurfaceValueGroup[] = [
  {
    key: "recipients",
    label: "Recipients",
    sortOrder: 100,
    description:
      "Who the email is addressed to: custom typed addresses, or a set of selected platform users.",
  },
  {
    key: "compose",
    label: "Message",
    sortOrder: 200,
    description:
      "The subject/body being composed, the available templates, and the last send attempt's outcome.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Recipients ───────────────────────────────────────────────────────
  {
    name: "recipient_mode",
    label: "Recipient mode",
    description:
      '"custom" when the admin is typing raw email addresses, "selected" when picking from the platform user list. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "recipients",
  },
  {
    name: "custom_emails_raw",
    label: "Custom email addresses",
    description:
      "The raw comma/newline-separated text in the custom-emails textarea. Empty when recipient_mode is \"selected\" or the field is untouched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 110,
    group: "recipients",
  },
  {
    name: "selected_user_ids",
    label: "Selected user IDs",
    description:
      'UUIDs of the platform users checked in the "Selected Users" picker. Preselected from `?userId=` when arriving via the Accounts "Email user" row action. Empty array when recipient_mode is "custom" or nobody is checked.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 120,
    group: "recipients",
  },

  // ── Compose ──────────────────────────────────────────────────────────
  {
    name: "subject",
    label: "Subject",
    description:
      "The email subject line currently in the form. Empty until the admin types one or picks a template.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 200,
    group: "compose",
  },
  {
    name: "message_body",
    label: "Message body",
    description:
      "The plain-text email body currently in the form. Empty until the admin types one or picks a template.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 210,
    group: "compose",
  },
  {
    name: "custom_from",
    label: "Custom from address",
    description:
      'The optional override "From" address/display name typed under Advanced Options. Empty when unset (the default from-address applies).',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 220,
    group: "compose",
  },
  {
    name: "available_templates",
    label: "Available templates",
    description:
      "Quick-start email templates loaded from `/api/admin/email`, each with { id, name, subject, message }. Empty array while loading or if none are configured.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 230,
    group: "compose",
  },
  {
    name: "is_sending",
    label: "Sending in progress",
    description:
      "True while a POST to /api/admin/email is in flight. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 240,
    group: "compose",
  },
  {
    name: "last_send_result",
    label: "Last send result",
    description:
      "Outcome of the most recent send attempt: { success, msg }. Absent until the admin has clicked Send at least once this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 250,
    group: "compose",
  },
];

/**
 * The write half — ONE target, and the reasoning for the line it draws.
 *
 * WHAT AN AGENT MAY WRITE HERE: the copy. Subject and body are authored
 * content an agent drafts better and faster than a person typing into a
 * textarea — the textbook YES on the judgment bar, and the thing this page's
 * own Tips card ("keep subject lines clear and concise", "personalize when
 * possible") is asking for.
 *
 * WHAT IT MAY NOT, and why each is a category and not a preference:
 *
 *  - RECIPIENTS. `recipient_mode`, `custom_emails_raw` and `selected_user_ids`
 *    are identity plus blast radius: they decide WHO on the platform receives
 *    a mass email. An agent that can quietly widen an announcement from three
 *    addresses to every selected account is the exact write this campaign
 *    refuses, and staging it into a collapsed panel is worse — the admin is
 *    reviewing prose in a confirm dialog, not auditing a recipient list. They
 *    stay undeclared, and the target description says so out loud so an agent
 *    asked to "add the whole team" explains rather than improvises.
 *  - THE FROM ADDRESS. `custom_from` decides who the mail appears to come
 *    from. That is sender identity, and the module docblock's SECURITY note
 *    governs it: `allowed_from_domains` is display text the API returned, so
 *    an agent writing here would be proposing a spoof it cannot itself verify.
 *  - SENDING. There is no `send_email` target and there will not be one. The
 *    agent drafts; the admin presses "Send Email". This is the same line
 *    `image-generate` drew at Generate (the press spends real money),
 *    `marketing-crawls` drew at starting a crawl, and `scraper` drew at
 *    running a scrape (the press spends someone else's server) — copied here
 *    deliberately, because an email is the one action on this list that cannot
 *    be undone at all once it leaves.
 *
 * WHY ONE PARTIAL-PATCH OBJECT AND NOT TWO TARGETS — the deliberate call
 * between the two precedents:
 *
 *  - `image-generate`'s `generation_request` (one object beat five micro
 *    targets) is the right model here, and `marketing-crawls`' separate
 *    targets are not, because subject and body are not independent decisions.
 *    They are ONE piece of copy: an announcement's subject IS the promise its
 *    body keeps, and the admin reviewing a draft wants to accept or reject the
 *    email, not half of it. Split into two targets, "Keep as is" on the
 *    subject and "Apply" on the body leaves a mismatched pair that reads as a
 *    mistake nobody made — the failure `scraper` avoided by bundling mode with
 *    the field the mode enables.
 *  - It is also the ordering fix. When an agent stages several targets in one
 *    turn the seam resolves every handler closure BEFORE the first dialog is
 *    confirmed, so interdependent fields spread over two targets are read off
 *    the same (possibly stale) render. One object resolves both fields
 *    atomically — the `scraper` argument, applied to a smaller surface.
 *  - Partial-patch keeps the fine-grained ask that separate targets would have
 *    bought: "make the subject punchier" sends `{ subject }` alone and the
 *    body is untouched, because an omitted key is never written.
 *
 * NO TEMPLATE TARGET, deliberately. Picking a template does exactly one thing
 * (`handleTemplateSelect` copies that template's subject and message into the
 * same two fields), so a `apply_template` target would be a second door onto
 * the state `email_draft` already owns — two writes in one turn racing to
 * clobber each other, for zero capability an agent does not already have. The
 * template list is a read value (`available_templates`, each entry carrying
 * its own `subject`/`message`), so an agent that wants a template writes that
 * template's copy through `email_draft` and the admin sees exactly what lands.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "email_draft",
    label: "Email draft",
    description:
      `Stages the email COPY into the compose form the admin is looking at. Nothing is sent and nothing leaves the building — the admin still presses "Send Email", and that press is never an agent action. ` +
      `Value: an object with AT LEAST ONE of { ${EMAIL_DRAFT_KEYS.join(", ")} }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (nothing here appends — read the current draft back from the \`subject\` and \`message_body\` values first if you mean to extend rather than replace). ` +
      `\`subject\` — the subject line; a non-empty plain-text string, ONE line only (it is an email header, so line breaks are refused), at most ${EMAIL_SUBJECT_MAX_CHARS} characters. ` +
      `\`message_body\` — the plain-text body; a non-empty plain-text string, at most ${EMAIL_BODY_MAX_CHARS} characters. Real newlines are fine and are preserved as written. This form sends PLAIN TEXT, not HTML — markup arrives as literal characters, so write prose, not tags. ` +
      `Send both as plain text, not JSON and not JSON-encoded. ` +
      `To reuse a quick-start template, read \`available_templates\` and write that entry's subject/message through this target so the admin can see and edit what lands. ` +
      `WHO the email goes to is NOT writable — recipient_mode, the typed address list, the selected users, and the From address have no write target on this surface. If the admin asks you to change the recipients, say that they set those themselves and describe what you would pick. ` +
      `Refused while is_sending is true — a send is already in flight against the OLD copy, so editing it would leave the form describing something nobody sent.`,
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "compose",
    sortOrder: 300,
  },
];

export const adminEmailManifest: SurfaceManifest = {
  surfaceName: ADMIN_EMAIL_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + AdminEmailPage emitter wired (the page mounts the surface's SurfaceRuntimeProvider and services the email_draft write target). The DB mirror IS in place: `ui.ui_surface_write_target` carries `email_draft` (synced 2026-08-11), and every mirrored column — label, value_type, mode, apply_policy, group, sort_order and the full 1547-character description — matches this file, so aidream can advertise the target server-side. Remaining: no `data-surface-value` anchors, and the read values have not had a full completeness audit against the page.",
  label: "Email Users",
  urlPattern: "/administration/users/email",
  intro: `<surface_intro>
This is an ADMIN surface: the Email Users compose tool at /administration/users/email, for sending a one-off email to either hand-typed addresses or selected platform users.

recipient_mode tells you whether custom_emails_raw or selected_user_ids is the live recipient list. subject and message_body are the draft; available_templates lists quick-start options the admin can pick from. is_sending is true only while a send POST is in flight; last_send_result reflects the LAST attempt only, never anything current or planned.

What you may safely do: help draft or improve subject/message copy, suggest a template, or reason about the selected recipients. The email_draft write target lets you put that copy straight into the form. You never send the email yourself — sending is the admin pressing "Send Email" — and you never choose the recipients or the From address: those have no write target here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One quick-start template as loaded from `/api/admin/email`. */
export interface AdminEmailTemplateEntry {
  id: string;
  name: string;
  subject: string;
  message: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminEmailScope(values: {
  // alwaysAvailable: true → required
  recipient_mode: "custom" | "selected";
  available_templates: AdminEmailTemplateEntry[];
  is_sending: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  custom_emails_raw?: string;
  selected_user_ids?: string[];
  subject?: string;
  message_body?: string;
  custom_from?: string;
  last_send_result?: { success: boolean; msg: string };
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
