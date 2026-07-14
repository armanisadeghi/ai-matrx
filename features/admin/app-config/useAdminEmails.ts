"use client";

// features/admin/app-config/useAdminEmails.ts
//
// user_id → admin email map for provenance columns (app_config.updated_by,
// app_config_history.changed_by). Loaded once per page via the existing
// admin_list SECURITY DEFINER RPC (the caller is already a super admin —
// this surface is super-admin gated). Module-scoped in-flight dedup so the
// list view and the history panel share one request.

import { useEffect, useState } from "react";

import { createClient } from "@/utils/supabase/client";

let adminEmailsPromise: Promise<Record<string, string>> | null = null;

function loadAdminEmails(): Promise<Record<string, string>> {
  if (!adminEmailsPromise) {
    adminEmailsPromise = (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("admin_list");
      if (error) {
        // Allow a retry on the next mount instead of caching the failure.
        adminEmailsPromise = null;
        throw new Error(error.message);
      }
      const map: Record<string, string> = {};
      for (const admin of data ?? []) {
        map[admin.user_id] = admin.email;
      }
      return map;
    })();
  }
  return adminEmailsPromise;
}

/**
 * Resolves admin user ids to emails. Returns an empty map until loaded (or
 * on failure) — callers fall back to the truncated-UUID rendering, so this
 * is pure enrichment and never blocks the surface.
 */
export function useAdminEmails(): Record<string, string> {
  const [emails, setEmails] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    loadAdminEmails()
      .then((map) => {
        if (!cancelled) setEmails(map);
      })
      .catch((error: unknown) => {
        console.warn(
          "[app-config] admin_list email lookup failed — provenance falls back to raw UUIDs",
          error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return emails;
}
