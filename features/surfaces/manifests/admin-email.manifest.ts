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
 * only (what the config API returned), never a value an agent can bypass.
 *
 * Emitters: NONE YET. `AdminEmailPage` (email/page.tsx) is a client component
 * with plenty of `useState` describing exactly this form, but has no
 * `SurfaceRuntimeProvider` mount — see readinessNote.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
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

export const adminEmailManifest: SurfaceManifest = {
  surfaceName: ADMIN_EMAIL_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired. AdminEmailPage (app/(admin)/administration/users/email/page.tsx) holds every value declared here in local useState but has no SurfaceRuntimeProvider mount or ApplicationScope builder.",
  label: "Email Users",
  urlPattern: "/administration/users/email",
  intro: `<surface_intro>
This is an ADMIN surface: the Email Users compose tool at /administration/users/email, for sending a one-off email to either hand-typed addresses or selected platform users.

recipient_mode tells you whether custom_emails_raw or selected_user_ids is the live recipient list. subject and message_body are the draft; available_templates lists quick-start options the admin can pick from. is_sending is true only while a send POST is in flight; last_send_result reflects the LAST attempt only, never anything current or planned.

What you may safely do: help draft or improve subject/message copy, suggest a template, or reason about the selected recipients. You never send the email yourself — sending is the admin pressing "Send Email".
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
