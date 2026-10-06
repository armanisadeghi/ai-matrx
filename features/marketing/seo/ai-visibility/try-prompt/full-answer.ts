// features/marketing/seo/ai-visibility/try-prompt/full-answer.ts — the whole
// answer behind a `try_prompt` result, read direct from Supabase.
//
// The tool caps the answer text it returns (knob `ai.answer_text_cap`); the
// full text is stored on the run's `seo.serp_snapshot` (search_type
// 'ai_answer', `serp_features.answer_text`), org-scoped by RLS. "Every
// truncated answer has a door" (ai-visibility FEATURE.md): a cut answer opens
// from here, never from the cut copy.

import { supabase } from "@/utils/supabase/client";

export async function readFullAnswer(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("seo")
    .from("serp_snapshot")
    .select("serp_features")
    .eq("run_id", runId)
    .eq("search_type", "ai_answer")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the stored answer failed: ${error.message}`);
  const features = data?.serp_features;
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  const text = (features as Record<string, unknown>).answer_text;
  return typeof text === "string" && text ? text : null;
}
