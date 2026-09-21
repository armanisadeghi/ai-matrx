// features/files/webhooks/service.ts
//
// Owner-scoped CRUD for outbound webhooks, direct against the `files` schema
// (RLS `owner_id = auth.uid()`). No Python hop, no Next.js API route — this is
// pure UI↔DB, the canonical path. Delivery itself is handled DB-side by the
// pg_cron pipeline in migrations/files_webhook_dispatcher.sql.

import { createClient } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookDelivery,
} from "./types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
// 🚨 THE SIGNING SECRET IS MINTED WHERE IT IS VERIFIED — not here. (SECURITY-SWEEP, 2026-09-21.)
// This file used to carry `generateWebhookSecret()`: 24 bytes of `crypto.getRandomValues` in
// the page, POSTed straight into `files.webhooks.secret` at create and at rotate. The
// dispatcher then signs every outbound delivery with `files.webhook_sign(secret, body)`, so
// the value the server proves itself with was chosen by whatever was running in the tab. It is
// now minted by `files.webhook_create` / `files.webhook_rotate_secret` (SECURITY DEFINER,
// owner-checked, `gen_random_bytes(24)`, same `whsec_` + 48 hex shape so every receiver that
// already verifies these signatures is unaffected) and returned exactly once, which is what
// the screen always promised. `secret` is withheld from the client grant entirely.

// Every column EXCEPT `secret` — the signing secret is shown once at create /
// rotate time and must never come back over the wire on a list read. Since the column left
// the client grant, this is also the only shape that READS: `select("*")` on this table is now
// a 42501, which is the point — a screen never needs a secret to render.
const WEBHOOK_LIST_COLUMNS =
  "id, owner_id, target_url, description, is_active, organization_id, event_types, resource_types, " +
  "last_attempt_at, last_success_at, consecutive_failures, max_consecutive_failures, created_at, updated_at";

export async function listWebhooks(): Promise<Webhook[]> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .from("webhooks")
    .select(WEBHOOK_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .returns<Webhook[]>();
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);
  return data ?? [];
}

export async function createWebhook(
  input: CreateWebhookInput,
): Promise<Webhook> {
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await getClaimsUser(supabase);
  if (userErr || !user) throw new Error("You must be signed in to create a webhook.");

  // 🚨 A WEBHOOK IS FILED IN AN ORGANIZATION, ALWAYS.
  // `files.webhooks` carries `public._stamp_org_default`, so the old
  // `?? null` was not "no organization" — it was the writer's PERSONAL
  // workspace, chosen by a trigger nobody can see. This surface genuinely
  // offers the choice: the manager's "org-wide" toggle (WebhooksManager,
  // shown only when an organization is selected) sends that organization;
  // leaving it off means "my own events", which IS the person's own
  // workspace — so we name it, rather than let the trigger guess it.
  // common-docs/policies/context-is-carried-never-rebuilt.md
  // org-fallback-deliberate: the person's own workspace is the "my own events" choice the org-wide toggle leaves off
  const organizationId = input.organization_id ?? (await resolvePersonalOrgId());
  // The door mints the secret and returns the whole row once — including it. `owner_id` is
  // stamped from `auth.uid()` inside the door, so it is not sent from here either.
  const { data, error } = await filesDb(supabase)
    .rpc("webhook_create", {
      p_target_url: input.target_url,
      p_organization_id: organizationId,
      p_description: input.description ?? undefined,
      p_event_types: input.event_types ?? undefined,
      p_resource_types: input.resource_types ?? undefined,
    })
    .single()
    .returns<Webhook>();
  if (error) throw new Error(`Failed to create webhook: ${error.message}`);
  return data;
}

export async function updateWebhook(
  id: string,
  patch: UpdateWebhookInput,
): Promise<Webhook> {
  // Belt-and-suspenders: the DB SSRF guard (files.webhook_url_guard) is the
  // real enforcement, but reject non-https here for a friendlier error.
  if (patch.target_url !== undefined && !/^https:\/\//i.test(patch.target_url)) {
    throw new Error("Webhook URL must start with https://");
  }
  if (patch.organization_id === null) {
    throw new Error(
      "A webhook stays filed in an organization. Choose one; it cannot be cleared.",
    );
  }
  const { organization_id: organizationId, ...rest } = patch;
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .from("webhooks")
    .update({
      ...rest,
      ...(organizationId !== undefined ? { organization_id: organizationId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(WEBHOOK_LIST_COLUMNS)
    .single()
    .returns<Webhook>();
  if (error) throw new Error(`Failed to update webhook: ${error.message}`);
  return data;
}

/** Rotate the signing secret through the door. Returns the new secret (show once). */
export async function rotateWebhookSecret(id: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .rpc("webhook_rotate_secret", { p_webhook_id: id })
    .returns<string>();
  if (error) throw new Error(`Failed to rotate secret: ${error.message}`);
  return data;
}

export async function deleteWebhook(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await filesDb(supabase).from("webhooks").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
}

/**
 * Send a signed test ping to this webhook on demand (bypasses event matching
 * so it always hits the exact endpoint). Returns the new delivery id; poll
 * `listDeliveries` to watch it settle to delivered/failed.
 */
export async function sendTestWebhook(webhookId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await filesDb(supabase).rpc("webhook_send_test", {
    p_webhook_id: webhookId,
  });
  if (error) throw new Error(`Failed to send test event: ${error.message}`);
}

/**
 * Manually re-enqueue a settled delivery (files.webhook_redeliver RPC —
 * SECURITY DEFINER, owner-checked against auth.uid()). Re-signs the canonical
 * event payload and re-posts immediately; the row flips back to `pending` and
 * the reconcile tick settles it. Test pings (no activity_log_id) are not
 * redeliverable — use `sendTestWebhook`.
 */
export async function redeliverWebhookDelivery(deliveryId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await filesDb(supabase).rpc("webhook_redeliver", {
    p_delivery_id: deliveryId,
  });
  if (error) throw new Error(`Failed to redeliver: ${error.message}`);
}

export async function listDeliveries(
  webhookId: string,
  limit = 25,
): Promise<WebhookDelivery[]> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .from("webhook_deliveries")
    .select("*")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<WebhookDelivery[]>();
  if (error) throw new Error(`Failed to load deliveries: ${error.message}`);
  return data ?? [];
}
