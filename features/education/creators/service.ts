// features/education/creators/service.ts
//
// CLIENT data path for the creator dashboard. Per CLAUDE.md, UI↔DB goes DIRECT
// via supabase-js (RLS + SECURITY DEFINER RPCs are the authorization) — no
// Next.js middle tier. Every creator mutation is a SECURITY DEFINER RPC gated on
// auth.uid() owning the row (see migrations/education_creator_profiles.sql). The
// public /c/[handle] page is force-dynamic, so there is no cache to bust here.

"use client";

import { createClient } from "@/utils/supabase/client";
import type { CreatorProfileMine, FeaturedItem, CreatorLink } from "./types";

function coerceMine(data: unknown): CreatorProfileMine | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const links = Array.isArray(o.links) ? (o.links as CreatorLink[]) : [];
  const featured = Array.isArray(o.featured) ? (o.featured as FeaturedItem[]) : [];
  return {
    handle: typeof o.handle === "string" ? o.handle : null,
    is_public: o.is_public === true,
    display_name: typeof o.display_name === "string" ? o.display_name : null,
    avatar_url: typeof o.avatar_url === "string" ? o.avatar_url : null,
    tagline: typeof o.tagline === "string" ? o.tagline : null,
    bio: typeof o.bio === "string" ? o.bio : null,
    links,
    featured,
    published_at: typeof o.published_at === "string" ? o.published_at : null,
  };
}

/** The caller's creator profile, or null if they haven't claimed a handle yet. */
export async function getMyCreatorProfile(): Promise<CreatorProfileMine | null> {
  const sb = createClient();
  const { data, error } = await sb.rpc("creator_get_mine");
  if (error) throw new Error(error.message);
  return coerceMine(data);
}

/** Is this handle available to the caller? Throws (with a friendly message) on invalid/reserved. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const sb = createClient();
  const { data, error } = await sb.rpc("creator_handle_available", { p_handle: handle });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Opt in as a creator by claiming a unique handle. Creates the profile row if needed. */
export async function claimHandle(
  handle: string,
  displayName?: string,
): Promise<CreatorProfileMine | null> {
  const sb = createClient();
  const { data, error } = await sb.rpc("creator_claim_handle", {
    p_handle: handle,
    p_display_name: displayName ?? undefined,
  });
  if (error) throw new Error(error.message);
  return coerceMine(data);
}

export interface CreatorProfilePatch {
  displayName?: string;
  tagline?: string;
  bio?: string;
  avatarUrl?: string;
  links?: CreatorLink[];
  featured?: FeaturedItem[];
}

/** Update the caller's creator identity + featured content. NULL args are left unchanged. */
export async function updateCreatorProfile(
  patch: CreatorProfilePatch,
): Promise<CreatorProfileMine | null> {
  const sb = createClient();
  const { data, error } = await sb.rpc("creator_update_profile", {
    p_display_name: patch.displayName ?? undefined,
    p_tagline: patch.tagline ?? undefined,
    p_bio: patch.bio ?? undefined,
    p_avatar_url: patch.avatarUrl ?? undefined,
    p_links: patch.links ?? undefined,
    p_featured: patch.featured ?? undefined,
  });
  if (error) throw new Error(error.message);
  return coerceMine(data);
}

/** Publish / unpublish the public landing page. */
export async function setCreatorPublic(isPublic: boolean): Promise<CreatorProfileMine | null> {
  const sb = createClient();
  const { data, error } = await sb.rpc("creator_set_public", { p_public: isPublic });
  if (error) throw new Error(error.message);
  return coerceMine(data);
}

// ─── Creator payouts (Stripe Connect Express) ───────────────────────────────────
//
// Stripe is a legitimate Next.js API-route concern (webhooks/checkout/Connect) per
// CLAUDE.md, so these — unlike the DIRECT-RPC calls above — go through the
// /api/stripe/connect/* routes (the server holds the Stripe secret + service_role).

/** The creator's live Connect payout status, for the earnings panel. */
export interface ConnectStatus {
  connected: boolean;
  configured: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  onboardedAt?: string | null;
  country?: string | null;
  defaultCurrency?: string | null;
}

/** Fetch the caller's Connect status (refreshes from Stripe server-side). */
export async function getConnectStatus(): Promise<ConnectStatus> {
  const res = await fetch("/api/stripe/connect/status", { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as Partial<ConnectStatus>;
  return {
    connected: json.connected === true,
    configured: json.configured !== false,
    chargesEnabled: json.chargesEnabled,
    payoutsEnabled: json.payoutsEnabled,
    detailsSubmitted: json.detailsSubmitted,
    onboardedAt: json.onboardedAt ?? null,
    country: json.country ?? null,
    defaultCurrency: json.defaultCurrency ?? null,
  };
}

/** Start (or resume) Connect Express onboarding — returns a hosted onboarding URL. */
export async function startConnectOnboarding(): Promise<{ url?: string; error?: string; connectDisabled?: boolean }> {
  const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; connectDisabled?: boolean };
  if (!res.ok) return { error: json.error ?? "Could not start onboarding.", connectDisabled: json.connectDisabled };
  return { url: json.url };
}

/** Open the creator's Stripe Express dashboard (Stripe hosts the payout UI). */
export async function openConnectDashboard(): Promise<{ url?: string; error?: string }> {
  const res = await fetch("/api/stripe/connect/dashboard", { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) return { error: json.error ?? "Could not open your payout dashboard." };
  return { url: json.url };
}

/** A public resource the creator owns and can feature (free tool). */
export interface OwnedPublicResource {
  resourceType: string;
  id: string;
  title: string;
}

/**
 * The caller's own PUBLIC resources, by type, for the "feature a free tool"
 * picker. Only public rows can be featured (a private resource would be dropped
 * by creator_public_page anyway). RLS scopes each read to the owner.
 */
export async function listMyPublicResources(): Promise<OwnedPublicResource[]> {
  const sb = createClient();
  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return [];

  const [sets, docs] = await Promise.all([
    sb.schema("education").from("fc_set")
      .select("id, name")
      .eq("created_by", uid).eq("visibility", "public").is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    sb.schema("education").from("learn_doc")
      .select("id, title")
      .eq("created_by", uid).eq("visibility", "public").is("deleted_at", null)
      .order("updated_at", { ascending: false }),
  ]);

  const out: OwnedPublicResource[] = [];
  for (const r of sets.data ?? []) {
    out.push({ resourceType: "fc_set", id: (r as { id: string }).id, title: (r as { name: string }).name });
  }
  for (const r of docs.data ?? []) {
    out.push({ resourceType: "learn_doc", id: (r as { id: string }).id, title: (r as { title: string }).title });
  }
  return out;
}
