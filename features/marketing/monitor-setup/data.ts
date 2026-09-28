/**
 * The tracker editor's direct reads and writes (React → Supabase under RLS).
 *
 * - the brand's monitors (`seo.coverage_tracker` by `brand_id`) and one monitor;
 * - the spokesperson / proof step: `web.business_fact` rows written directly
 *   under that table's RLS (NEWS-ENGINE-SPEC §12 Lane G), as the shapes the
 *   news client context reads (`label` spokesperson | proof, `kind` other);
 * - the brief: a note Source in `workbench.notes`, which the tracker points at
 *   through `brief_source_id` (the engine never parses it);
 * - the latest mentions a run surfaced, for the run view.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { CoverageTrackerRow } from "@/features/marketing/data/coverage-types";
import type { BusinessFact } from "@/features/marketing/types";
import { createNote, fetchNoteById, updateNote } from "@/features/notes/service/notesService";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb, requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

export const monitorSetupKeys = {
  all: ["marketing", "monitor-setup"] as const,
  brandTrackers: (brandId: string) =>
    [...monitorSetupKeys.all, "brand-trackers", brandId] as const,
  tracker: (trackerId: string) =>
    [...monitorSetupKeys.all, "tracker", trackerId] as const,
  brief: (noteId: string) => [...monitorSetupKeys.all, "brief", noteId] as const,
  runMentions: (trackerId: string) =>
    [...monitorSetupKeys.all, "run-mentions", trackerId] as const,
};

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function fail(error: unknown, what: string): never {
  if (error instanceof Error) throw error;
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  throw new Error(`Could not ${what}: ${message}`);
}

export async function listBrandTrackers(
  brandId: string,
  signal?: AbortSignal,
): Promise<CoverageTrackerRow[]> {
  const response = await (await seoDb())
    .from("coverage_tracker")
    .select("*")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) fail(response.error, "load this brand's monitors");
  return response.data ?? [];
}

export async function getTracker(
  trackerId: string,
  signal?: AbortSignal,
): Promise<CoverageTrackerRow | null> {
  const response = await (await seoDb())
    .from("coverage_tracker")
    .select("*")
    .eq("id", trackerId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) fail(response.error, "load this monitor");
  return response.data;
}

export function useBrandTrackers(brandId: string) {
  return useQuery({
    queryKey: monitorSetupKeys.brandTrackers(brandId),
    queryFn: ({ signal }) => listBrandTrackers(brandId, signal),
    enabled: Boolean(brandId),
  });
}

export function useTracker(trackerId: string | null) {
  return useQuery({
    queryKey: monitorSetupKeys.tracker(trackerId ?? ""),
    queryFn: ({ signal }) => getTracker(trackerId ?? "", signal),
    enabled: Boolean(trackerId),
  });
}

export function useInvalidateMonitorSetup() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: monitorSetupKeys.all });
}

// ── the spokesperson / proof step ─────────────────────────────────────────

export const SPOKESPERSON_LABELS = new Set(["spokesperson", "spokes_person", "spokesman", "spokeswoman"]);
export const PROOF_LABELS = new Set(["proof", "proof_asset", "proof_point", "case_study"]);

function factTag(fact: BusinessFact): string {
  const value = (fact.value ?? {}) as Record<string, unknown>;
  return String(fact.label ?? value.fact_kind ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function isSpokesperson(fact: BusinessFact): boolean {
  return SPOKESPERSON_LABELS.has(factTag(fact));
}

export function isProof(fact: BusinessFact): boolean {
  return PROOF_LABELS.has(factTag(fact));
}

export function factText(fact: BusinessFact): string {
  const value = (fact.value ?? {}) as Record<string, unknown>;
  const main = String(value.name ?? value.summary ?? value.text ?? "").trim();
  const title = String(value.title ?? "").trim();
  return title ? `${main} — ${title}` : main;
}

export async function addSpokesperson(input: {
  organizationId: string;
  brandId: string;
  name: string;
  title: string;
}): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const name = input.name.trim();
  const title = input.title.trim();
  const response = await db
    .from("business_fact")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      kind: "other",
      label: "spokesperson",
      value: title ? { text: name, name, title } : { text: name, name },
      source: "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (response.error) fail(response.error, "add this spokesperson");
}

export async function addProof(input: {
  organizationId: string;
  brandId: string;
  summary: string;
  url: string;
}): Promise<void> {
  const db = await authenticatedWebDb(supabase);
  const summary = input.summary.trim();
  const url = input.url.trim();
  const response = await db
    .from("business_fact")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      kind: "other",
      label: "proof",
      value: url ? { text: summary, summary, url } : { text: summary, summary },
      source: "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (response.error) fail(response.error, "add this proof");
}

// ── the brief (a note Source) ─────────────────────────────────────────────

export function useBriefNote(noteId: string | null) {
  return useQuery({
    queryKey: monitorSetupKeys.brief(noteId ?? ""),
    queryFn: () => fetchNoteById(noteId ?? "", { failureMode: "throw" }),
    enabled: Boolean(noteId),
  });
}

/** Write the brief as a note in the brand's organization and return its id. */
export async function saveBriefNote(input: {
  organizationId: string;
  noteId: string | null;
  brandName: string;
  content: string;
}): Promise<string> {
  if (input.noteId) {
    await updateNote(input.noteId, { content: input.content });
    return input.noteId;
  }
  const note = await createNote({
    organization_id: input.organizationId,
    label: `News monitor brief — ${input.brandName}`,
    content: input.content,
    folder_name: "Monitor briefs",
  });
  return note.id;
}

// ── the run view ──────────────────────────────────────────────────────────

export interface RunMention {
  id: string;
  title: string | null;
  url: string;
  domain: string;
  verdict: string | null;
  is_competitor: boolean;
  discovered_at: string;
}

export async function listRunMentions(
  trackerId: string,
  signal?: AbortSignal,
): Promise<RunMention[]> {
  const response = await (await seoDb())
    .from("coverage_mention")
    .select("id, title, url, domain, verdict, is_competitor, discovered_at")
    .eq("tracker_id", trackerId)
    .order("discovered_at", { ascending: false })
    .limit(5)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) fail(response.error, "load what the run looked at");
  return (response.data ?? []) as RunMention[];
}

export function useRunMentions(trackerId: string | null, runKey: number) {
  return useQuery({
    queryKey: [...monitorSetupKeys.runMentions(trackerId ?? ""), runKey],
    queryFn: ({ signal }) => listRunMentions(trackerId ?? "", signal),
    enabled: Boolean(trackerId) && runKey > 0,
  });
}
