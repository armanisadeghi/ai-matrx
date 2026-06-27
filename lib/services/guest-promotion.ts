// lib/services/guest-promotion.ts
//
// Server-only: promote an anonymous "guest" auth.users record into a real
// account IN PLACE, preserving its UUID.
//
// Why in-place (not a per-table data transfer): a guest is already a real
// anonymous `auth.users` row. The Python backend mints it from the visitor's
// fingerprint (`resolve_guest_uuid` in matrx-ai/db/guest_registry.py) and
// stamps `guest_executions.auth_user_id`. EVERYTHING the guest creates —
// cloud files (owner = uid), cx_conversation, cx_message, agent memory — is
// owned by that anon UUID. Promoting the same UUID to a permanent account
// (Supabase `updateUserById` with email+password) means every one of those
// rows belongs to the new account for free. No enumeration, no migration RPC.
//
// This replaces the never-functional `/files/migrate-guest-to-user` transfer
// path (dead table `cld_guest_migrations` + RPC, both already swept from the
// DB). Verified live: admin promotion flips `is_anonymous` → false, keeps the
// UUID, confirms the email, and password login works.
//
// Gating: uses the service-role admin client. This is a sanctioned admin
// operation (CLAUDE.md "admin-only operations gated by a secret token") run
// only inside the sign-up server action — never exposed to the browser.

import "server-only";

import { createAdminClient } from "@/utils/supabase/adminClient";

export type GuestPromotionResult =
  | { promoted: true; userId: string }
  | {
      promoted: false;
      reason:
        | "no_guest" // no guest row / no anon uid for this fingerprint
        | "already_converted" // this guest was already promoted
        | "not_anonymous" // the mapped uid is already a real account
        | "email_in_use" // email belongs to another real account
        | "error"; // unexpected failure — caller falls back to normal sign-up
      message?: string;
    };

/** Minimal server-side fingerprint sanity check (mirrors fingerprint-service
 *  without importing the browser-only FingerprintJS module). */
function looksLikeFingerprint(fp: string | undefined | null): fp is string {
  if (!fp || typeof fp !== "string") return false;
  if (fp.length < 16) return false;
  if (fp.startsWith("temp_")) return true;
  return /^[a-zA-Z0-9]+$/.test(fp);
}

export interface PromoteGuestArgs {
  /** The OLD guest fingerprint from the browser (localStorage). */
  fingerprint: string;
  /** The email the visitor is signing up with. */
  email: string;
  /** The password the visitor is signing up with. */
  password: string;
}

/**
 * Promote the anonymous guest mapped to `fingerprint` into a real account
 * with the given email/password. Returns `{ promoted: true, userId }` on
 * success (UUID unchanged). On any non-success the caller should fall back to
 * a normal sign-up — EXCEPT `email_in_use`, which must surface "please log in".
 */
export async function promoteGuestToUser({
  fingerprint,
  email,
  password,
}: PromoteGuestArgs): Promise<GuestPromotionResult> {
  if (!looksLikeFingerprint(fingerprint)) {
    return { promoted: false, reason: "no_guest" };
  }

  const admin = createAdminClient();

  // 1. Resolve the anon auth uid for this fingerprint.
  const { data: rows, error: selErr } = await admin
    .from("guest_executions")
    .select("id, auth_user_id, converted_to_user_id")
    .eq("fingerprint", fingerprint)
    .limit(1);

  if (selErr) {
    console.error(
      "[guest-promotion] LOUD: guest_executions lookup failed — falling back to normal sign-up:",
      selErr.message,
    );
    return { promoted: false, reason: "error", message: selErr.message };
  }

  const row = rows?.[0] as
    | { id: string; auth_user_id: string | null; converted_to_user_id: string | null }
    | undefined;

  if (!row || !row.auth_user_id) {
    // Visitor never had a server-minted guest identity (e.g. only ever
    // browsed, never triggered a guest execution). Nothing to promote.
    return { promoted: false, reason: "no_guest" };
  }
  if (row.converted_to_user_id) {
    return { promoted: false, reason: "already_converted" };
  }

  const anonId = row.auth_user_id;

  // 2. Confirm the mapped user is still anonymous before we touch it.
  const { data: got, error: getErr } = await admin.auth.admin.getUserById(anonId);
  if (getErr || !got?.user) {
    console.error(
      "[guest-promotion] LOUD: mapped auth_user_id not found — stale guest row:",
      getErr?.message,
    );
    return { promoted: false, reason: "no_guest" };
  }
  if (got.user.is_anonymous === false) {
    // The uid is already a real account. Never clobber its email/password.
    return { promoted: false, reason: "not_anonymous" };
  }

  // 3. Promote in place: add email + password + confirm. UUID is preserved.
  const { data: upd, error: updErr } = await admin.auth.admin.updateUserById(anonId, {
    email,
    password,
    email_confirm: true,
  });

  if (updErr) {
    const m = (updErr.message || "").toLowerCase();
    const code = (updErr as { code?: string }).code;
    if (
      code === "email_exists" ||
      m.includes("already been registered") ||
      m.includes("already registered") ||
      m.includes("already exists") ||
      m.includes("email_exists")
    ) {
      return { promoted: false, reason: "email_in_use" };
    }
    console.error(
      "[guest-promotion] LOUD: promotion updateUserById failed — falling back to normal sign-up:",
      updErr.message,
    );
    return { promoted: false, reason: "error", message: updErr.message };
  }

  const promotedId = upd?.user?.id ?? anonId;

  // 4. Stamp the conversion on the guest row (the `link_guest_to_user`
  //    equivalent). Non-fatal: promotion already succeeded.
  const { error: linkErr } = await admin
    .from("guest_executions")
    .update({
      converted_to_user_id: promotedId,
      converted_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (linkErr) {
    console.error(
      "[guest-promotion] LOUD: conversion succeeded but stamping guest_executions failed:",
      linkErr.message,
    );
  }

  return { promoted: true, userId: promotedId };
}
