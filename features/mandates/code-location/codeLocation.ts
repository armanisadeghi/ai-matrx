"use client";

// features/mandates/code-location/codeLocation.ts
//
// WHERE CODE DECLARES EACH MANDATE — repo, file and line range, SUPER ADMINS ONLY.
//
// Arman, 2026-10-09: "Each one needs to tell me the exact repo, file, and lines
// of code." and "the location is confidential and should only be able to be
// seen by a superadmin."
//
// The value is `mandate.definition.code_path`, written by aidream's
// `mandate_reference_patrol` leg `code_location`
// (aidream/aidream/services/mandates/code_location.py — the format's one writer):
//
//     <repo>:<repo-relative file>:<first line>-<last line>
//     aidream:aidream/services/content_plan/mandates.py:795-812
//
// It is read ONLY through `mandate.code_locations()`, which refuses (42501)
// anyone who is not a super admin in the admin lane. Callers ask only when
// `selectIsSuperAdmin` is true, so a non-super-admin browser never asks.

import { supabase } from "@/utils/supabase/client";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";

export interface MandateCodeLocation {
  repo: string;
  filePath: string;
  lineStart: number;
  /** Null until a range-aware scan (matrx-mandate-scan >= 0.2.24) measured it. */
  lineEnd: number | null;
}

export interface MandateCodeLocationEntry {
  mandateKey: string;
  origin: "code" | "user" | string;
  isEnabled: boolean;
  /** The raw stored value; null for an app-created mandate. */
  codePath: string | null;
  /** Parsed `codePath`; null when it is not the format (or absent). */
  location: MandateCodeLocation | null;
  githubFullName: string | null;
}

/** The TypeScript twin of `code_location.CODE_LOCATION_RE`. */
const CODE_LOCATION_RE =
  /^([A-Za-z0-9][A-Za-z0-9._-]*):([^:\s](?:[^:]*[^:\s])?):([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;

export function parseCodeLocation(text: string | null | undefined): MandateCodeLocation | null {
  const match = CODE_LOCATION_RE.exec((text ?? "").trim());
  if (!match) return null;
  const lineStart = Number(match[3]);
  const lineEnd = match[4] ? Number(match[4]) : null;
  if (lineEnd !== null && lineEnd < lineStart) return null;
  return { repo: match[1], filePath: match[2], lineStart, lineEnd };
}

/** `120-138`, or `120` when the range is not measured yet. */
export function lineRangeText(location: MandateCodeLocation): string {
  return location.lineEnd !== null && location.lineEnd !== location.lineStart
    ? `${location.lineStart}-${location.lineEnd}`
    : String(location.lineStart);
}

/** The file at those lines on GitHub's default branch, or null without a remote. */
export function githubRangeUrl(
  githubFullName: string | null | undefined,
  location: MandateCodeLocation,
): string | null {
  if (!githubFullName) return null;
  const path = location.filePath.split("/").map(encodeURIComponent).join("/");
  const end =
    location.lineEnd !== null && location.lineEnd !== location.lineStart
      ? `-L${location.lineEnd}`
      : "";
  return `https://github.com/${githubFullName}/blob/main/${path}#L${location.lineStart}${end}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function entriesFromPayload(payload: unknown): Map<string, MandateCodeLocationEntry> {
  if (!Array.isArray(payload)) throw new Error("Code locations: the answer is not a list.");
  const out = new Map<string, MandateCodeLocationEntry>();
  for (const item of payload) {
    if (!isRecord(item) || typeof item.mandate_key !== "string") continue;
    const codePath = typeof item.code_path === "string" ? item.code_path : null;
    out.set(item.mandate_key, {
      mandateKey: item.mandate_key,
      origin: typeof item.origin === "string" ? item.origin : "",
      isEnabled: item.is_enabled === true,
      codePath,
      location: parseCodeLocation(codePath),
      githubFullName: typeof item.github_full_name === "string" ? item.github_full_name : null,
    });
  }
  return out;
}

/** One read of every live mandate's location. Super admins only — refuses otherwise. */
export async function fetchMandateCodeLocations(): Promise<Map<string, MandateCodeLocationEntry>> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.schema("mandate").rpc("code_locations", {}),
  );
  if (error) throw new Error(`Code locations: ${error.message ?? "read failed"}`);
  return entriesFromPayload(data);
}

// ── One shared read per visit ──────────────────────────────────────────────

export type CodeLocationsState =
  | { status: "idle" | "loading" }
  | { status: "ready"; byKey: Map<string, MandateCodeLocationEntry> }
  | { status: "failed"; error: string };

let state: CodeLocationsState = { status: "idle" };
const listeners = new Set<() => void>();

function publish(next: CodeLocationsState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeCodeLocations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function codeLocationsSnapshot(): CodeLocationsState {
  return state;
}

/** Ask once; `force` asks again (after a failure, or a retry). */
export function ensureMandateCodeLocations(force = false): void {
  if (!force && state.status !== "idle") return;
  publish({ status: "loading" });
  fetchMandateCodeLocations().then(
    (byKey) => publish({ status: "ready", byKey }),
    (error: unknown) =>
      publish({ status: "failed", error: error instanceof Error ? error.message : String(error) }),
  );
}
