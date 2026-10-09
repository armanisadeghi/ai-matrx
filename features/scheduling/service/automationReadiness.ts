/**
 * Automation readiness — which mandates are refusing to run because a core input is missing.
 *
 * Owner, 2026-10-08: automations never run without their core data, and the boards make it clear
 * what is required for what to run. aidream's readiness gate (services/mandates/readiness.py) writes
 * one `mandate.readiness_verdict` row per (organization, mandate, scope) before any paid call; this
 * file reads the NOT-READY rows once per page and turns them into the "Not ready" flag-strip hit
 * whose tooltip names each missing input.
 */
"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "@/utils/supabase/client";
import type { SpendFlagHit } from "@/components/cost/SpendFlagStrip";

export interface ReadinessMissing {
  key: string;
  label: string;
  fill_url: string;
}

export interface NotReadyVerdict {
  organization_id: string;
  mandate_key: string;
  scope_key: string;
  summary: string | null;
  missing: ReadinessMissing[];
  checked_at: string;
}

let index: Map<string, NotReadyVerdict[]> | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function asMissing(raw: unknown): ReadinessMissing[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m) =>
    m && typeof m === "object" && typeof (m as Record<string, unknown>).label === "string"
      ? [{
          key: String((m as Record<string, unknown>).key ?? ""),
          label: String((m as Record<string, unknown>).label),
          fill_url: String((m as Record<string, unknown>).fill_url ?? ""),
        }]
      : [],
  );
}

async function load(): Promise<void> {
  const { data, error } = await supabase
    .schema("mandate")
    .from("readiness_verdict")
    .select("organization_id, mandate_key, scope_key, summary, missing, checked_at")
    .eq("ready", false)
    .is("deleted_at", null)
    .order("checked_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`mandate.readiness_verdict: ${error.message}`);
  const next = new Map<string, NotReadyVerdict[]>();
  for (const row of data ?? []) {
    const list = next.get(row.mandate_key) ?? [];
    list.push({
      organization_id: row.organization_id,
      mandate_key: row.mandate_key,
      scope_key: row.scope_key,
      summary: row.summary,
      checked_at: row.checked_at,
      missing: asMissing(row.missing),
    });
    next.set(row.mandate_key, list);
  }
  index = next;
  emit();
}

function ensureLoaded() {
  if (!loading) {
    loading = load().catch((e: unknown) => {
      loading = null;
      console.error("[automationReadiness]", e);
    });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureLoaded();
  return () => listeners.delete(listener);
}

/** Call once in a board: loads the not-ready verdicts and re-renders the board when they land. */
export function useAutomationReadiness(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/** The not-ready verdicts for these mandates (optionally one organization's). */
export function notReadyFor(mandateKeys: readonly (string | null | undefined)[], orgId?: string | null): NotReadyVerdict[] {
  if (!index) return [];
  const out: NotReadyVerdict[] = [];
  for (const key of mandateKeys) {
    if (!key) continue;
    for (const v of index.get(key) ?? []) if (!orgId || v.organization_id === orgId) out.push(v);
  }
  return out;
}

/** A platform-wide run (no site, brand or tracker) is filled on the keyword data-quality desk. */
export const PLATFORM_SCOPE_FILL_URL = "/marketing/operations/data-quality";

/** Where one missing input is filled. Older rows wrote the generic "/marketing" for a platform-wide run. */
export function fillUrlFor(verdict: NotReadyVerdict, missing: ReadinessMissing): string {
  const url = missing.fill_url.trim();
  if (verdict.scope_key === "platform" && (url === "" || url === "/" || url === "/marketing")) {
    return PLATFORM_SCOPE_FILL_URL;
  }
  return url;
}

/** The flag-strip hit: one "Not ready" icon, the missing inputs in its tooltip, opening the fill page. */
export function notReadyHit(mandateKeys: readonly (string | null | undefined)[], orgId?: string | null): SpendFlagHit | null {
  const verdicts = notReadyFor(mandateKeys, orgId);
  if (verdicts.length === 0) return null;
  const labels = Array.from(new Set(verdicts.flatMap((v) => v.missing.map((m) => m.label))));
  const scopes = new Set(verdicts.map((v) => `${v.organization_id}|${v.scope_key}`)).size;
  const first = verdicts.find((v) => v.missing.length > 0);
  const href = first ? fillUrlFor(first, first.missing[0]) : undefined;
  return {
    slot: "not_ready",
    severity: "critical",
    detail: `Missing ${labels.join(", ")}${scopes > 1 ? ` (${scopes} scopes)` : ""}`,
    href: href && href.startsWith("/") ? href : undefined,
  };
}
