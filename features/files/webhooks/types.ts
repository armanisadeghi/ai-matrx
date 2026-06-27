// features/files/webhooks/types.ts
//
// Outbound webhooks: a user registers an HTTPS endpoint and gets a signed POST
// whenever one of their events fires (a file is shared, a long-running job
// finishes, etc.). Delivery is handled DB-side by the files.webhook_* pipeline
// (see migrations/files_webhook_dispatcher.sql). The browser only does
// owner-scoped CRUD against files.webhooks / files.webhook_deliveries.

export interface Webhook {
  id: string;
  owner_id: string;
  target_url: string;
  /**
   * The HMAC signing secret. ONLY returned at create / rotate time (shown to
   * the user once). List reads omit it — never surface a stored secret in a
   * network response after creation.
   */
  secret?: string;
  description: string | null;
  is_active: boolean;
  /** null = subscribe to ALL event types. Otherwise an allow-list of actions. */
  event_types: string[] | null;
  /** null = ALL resource types. Otherwise an allow-list of entity_types. */
  resource_types: string[] | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  max_consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "abandoned";

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  activity_log_id: number | null;
  status: WebhookDeliveryStatus;
  attempt: number;
  http_status: number | null;
  latency_ms: number | null;
  error_message: string | null;
  next_attempt_at: string | null;
  signature: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreateWebhookInput {
  target_url: string;
  description?: string | null;
  /** null/undefined = all events. */
  event_types?: string[] | null;
  resource_types?: string[] | null;
}

export interface UpdateWebhookInput {
  target_url?: string;
  description?: string | null;
  is_active?: boolean;
  event_types?: string[] | null;
  resource_types?: string[] | null;
}

/**
 * The event catalogue users can subscribe to. `value` is the activity_log
 * `action`. Grows as more producers emit to platform.activity_log (run
 * lifecycle events land here as `*.run.*`).
 */
export const WEBHOOK_EVENT_CATALOGUE: ReadonlyArray<{
  group: string;
  value: string;
  label: string;
}> = [
  { group: "Files", value: "file.shared", label: "File shared" },
  { group: "Files", value: "file.deleted", label: "File deleted" },
  { group: "Files", value: "file.restored", label: "File restored" },
  { group: "Files", value: "file.visibility_changed", label: "File visibility changed" },
  { group: "Sharing", value: "share_link.created", label: "Share link created" },
  { group: "Sharing", value: "share_link.revoked", label: "Share link revoked" },
  { group: "Sharing", value: "share_link.consumed", label: "Share link used" },
  { group: "Permissions", value: "permission.granted", label: "Permission granted" },
  { group: "Permissions", value: "permission.revoked", label: "Permission revoked" },
  { group: "Jobs", value: "run.completed", label: "Long-running job finished" },
  { group: "Jobs", value: "run.failed", label: "Long-running job failed" },
];
