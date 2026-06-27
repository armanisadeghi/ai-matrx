// features/files/webhooks/service.ts
//
// Owner-scoped CRUD for outbound webhooks, direct against the `files` schema
// (RLS `owner_id = auth.uid()`). No Python hop, no Next.js API route — this is
// pure UI↔DB, the canonical path. Delivery itself is handled DB-side by the
// pg_cron pipeline in migrations/files_webhook_dispatcher.sql.

import { createClient } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  Webhook,
  WebhookDelivery,
} from "./types";

/** Generate a signing secret shown to the user once at creation. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `whsec_${hex}`;
}

export async function listWebhooks(): Promise<Webhook[]> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .from("webhooks")
    .select("*")
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
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("You must be signed in to create a webhook.");

  const secret = generateWebhookSecret();
  const { data, error } = await filesDb(supabase)
    .from("webhooks")
    .insert({
      owner_id: user.id,
      target_url: input.target_url,
      secret,
      description: input.description ?? null,
      event_types: input.event_types ?? null,
      resource_types: input.resource_types ?? null,
      is_active: true,
    })
    .select("*")
    .single()
    .returns<Webhook>();
  if (error) throw new Error(`Failed to create webhook: ${error.message}`);
  return data;
}

export async function updateWebhook(
  id: string,
  patch: UpdateWebhookInput,
): Promise<Webhook> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase)
    .from("webhooks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
    .returns<Webhook>();
  if (error) throw new Error(`Failed to update webhook: ${error.message}`);
  return data;
}

/** Rotate the signing secret. Returns the new secret (show once). */
export async function rotateWebhookSecret(id: string): Promise<string> {
  const secret = generateWebhookSecret();
  const supabase = createClient();
  const { error } = await filesDb(supabase)
    .from("webhooks")
    .update({ secret, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to rotate secret: ${error.message}`);
  return secret;
}

export async function deleteWebhook(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await filesDb(supabase).from("webhooks").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
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
