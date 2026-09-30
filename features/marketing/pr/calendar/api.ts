// features/marketing/pr/calendar/api.ts
//
// The PR calendar's two reads (direct to the database, as every client read is) and its
// one piece of work: `POST /pr-calendar/brands/{brand_id}/run`, streamed — the same
// pipeline the PR Director's calendar planner member runs.

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import type { PrMomentRow } from "./calendar-model";

export async function readBrandCalendarMetadata(brandId: string): Promise<Json | null> {
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await supabase
    .schema("web")
    .from("brand")
    .select("metadata")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data?.metadata ?? null;
}

/** Every live moment in the brand's feed, soonest first. */
export async function listBrandMoments(brandId: string): Promise<PrMomentRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await supabase
    .schema("seo")
    .from("pr_moment")
    .select("*")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("starts_on", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

export interface CalendarRunOptions {
  /** Run the moment researcher (a paid, tool-using agent). Off → holidays, catalog and regulatory dates only. */
  research: boolean;
}

/** Refresh the brand's feed and plan. Streams each stage's sentence to `onProgress`. */
export async function runBrandCalendar(
  dispatch: AppDispatch,
  brandId: string,
  organizationId: string,
  options: CalendarRunOptions,
  onProgress: (message: string) => void,
): Promise<void> {
  const outcome = await dispatch(
    callApi({
      path: "/pr-calendar/brands/{brand_id}/run",
      pathParams: { brand_id: brandId },
      method: "POST",
      body: { research: options.research, plan: true },
      stream: true,
      scopeOverrides: { organization_id: organizationId },
      onStreamEvent: (event) => {
        const data = (event as { data?: unknown }).data;
        if (!data || typeof data !== "object") return;
        const record = data as Record<string, unknown>;
        if (record.__kind === "pr_calendar_progress" && typeof record.message === "string") {
          onProgress(record.message);
        }
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "The calendar could not be refreshed.");
  }
}
