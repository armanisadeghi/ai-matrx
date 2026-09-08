/**
 * The app's messaging TYPES — what is left after `@ai-matrx/messaging` took the
 * domain.
 *
 * Conversations, messages, participants, presence, hooks and store shapes are
 * the package's now: import them from `@ai-matrx/messaging`. Keeping a second
 * spelling of a conversation here is how the two drift, and every type this
 * file used to export described code that no longer exists.
 *
 * What genuinely belongs to THIS app is the actionable-message envelope: the
 * kinds this product defines, their payloads, and the surfaces in
 * `actions/messageActionSurfaces.tsx` that draw them. The package carries the
 * envelope; the meaning of `resource_shared` or `agent_drift` is ours.
 *
 * `UserBasicInfo` stays because the user DIRECTORY is ours too — the people
 * picker searches this app's profiles, which is not something a messaging
 * package should know about.
 */

import type { JsonObject } from "@/types/json";

// ============================================
// Actionable messages — this app's kinds
// ============================================

export interface MessageActionData<K extends string = string, P = unknown> {
  kind: K;
  /** Payload schema version per kind. */
  version: number;
  payload: P;
}

/** Payload for `kind: "agent_drift"`. */
export interface AgentDriftActionPayload {
  agent_id: string;
  agent_name: string;
  alert_id?: string | null;
  severity?: string | null;
  counts?: Partial<
    Record<"breaking" | "silent_breaking" | "warning" | "info", number>
  >;
  /** Set when the notification was about one specific usage. */
  usage_type?: string;
  usage_id?: string;
  usage_label?: string;
}

/**
 * Payload for `kind: "open_link"` — the generic "one in-app deep-link chip"
 * envelope for system DMs that just need to point the user at a page
 * (e.g. "Re-save your GITHUB_PAT" → /settings/secrets). In-app paths only.
 */
export interface OpenLinkActionPayload {
  /** In-app path starting with "/" (never an external URL). */
  href: string;
  /** Chip label, e.g. "Open Secrets settings". */
  label: string;
}

/**
 * Payload for `kind: "task_reminder"` — actionable task notification
 * (assignment, due-date reminder). Chips: Open / Complete / Snooze.
 */
export interface TaskReminderActionPayload {
  task_id: string;
  title: string;
  due_date?: string | null;
  /** Carried so Complete can roll recurring tasks without a fetch. */
  recurrence_rule?: string | null;
}

/** Payload for `kind: "resource_shared"` — "X shared a Note with you". */
export interface ResourceSharedActionPayload {
  /** Registry entity token (e.g. "note", "agent"). */
  resource_type: string;
  resource_id: string;
  /** Human title of the shared resource (the sharer supplies it). */
  resource_title: string;
  /** Display label of the type (e.g. "Note"). */
  resource_label: string;
  /** Permission granted to the recipient. */
  permission_level?: "viewer" | "editor" | "admin";
  /** Display name of the person who shared it. */
  sharer_name?: string;
}

/**
 * Payload for `kind: "access_request"` — "someone wants into your Site".
 *
 * The DM IS the approval surface: the chips grant/decline/report in place, so
 * the owner never has to go find a queue. Carries the pretty label and title so
 * the bubble reads as a sentence even if the record is later renamed or the
 * reader has no access to resolve it.
 */
export interface AccessRequestActionPayload {
  request_id: string;
  /** Registry entity token of the thing being asked for. */
  resource_type: string;
  resource_id: string;
  requested_level: "viewer" | "editor" | "admin";
  /** Distinguishes an access upgrade from a one-click owner action. */
  request_kind?: "resource_access" | "resource_action";
  action_key?: "delete" | null;
  action_label?: string | null;
  entity_label: string | null;
  entity_title: string | null;
  /** The requester's own note, if they wrote one. */
  note?: string | null;
  /** Where the record lives, when the registry could resolve a route. */
  href?: string | null;
}

/** Payload for an admin-only setting request with an inline registered action. */
export interface SettingAccessRequestActionPayload {
  request_id: string;
  organization_id: string;
  setting_key: string;
  setting_label: string;
  href: string;
  action_key: string;
  action_payload: JsonObject;
  note?: string | null;
}


// ============================================
// The app's user directory
// ============================================

export interface UserBasicInfo {
  user_id: string; // auth.users.id UUID
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ============================================
// Extended Types with User Info
// ============================================
