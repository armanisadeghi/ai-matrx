// /demos/kind-streaming-options — the rules bakeoff: real kinds streaming
// their canonical examples under the three rendering postures (progressive /
// smart loader / wait-for-all), so the per-kind rules get decided by LOOKING.

import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import StreamingOptionsDemo, { type DemoKind } from "./StreamingOptionsDemo";

export const metadata: Metadata = {
  title: "Kind Streaming Options",
  description:
    "Real kinds streaming their canonical examples under the three rendering postures.",
};

/** Candidates, in display order; missing/example-less ones are skipped. */
const CANDIDATE_KINDS = [
  "quiz_set",
  "flashcard_set",
  "presentation_deck",
  "study_notes",
  "study_pack_set",
  "comparison_set",
  "decision_tree",
  "math_problem",
  "diagram_spec",
  "cooking_recipe",
  "item_presentation",
  "citation",
  "rating",
] as const;

const MAX_KINDS = 10;

export default async function KindStreamingOptionsPage() {
  const supabase = await createClient();

  const { data: defs, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,kind,label,metadata")
    .in("kind", [...CANDIDATE_KINDS])
    .is("deleted_at", null);
  if (error) {
    throw new Error(`kind_definition read failed: ${error.message}`);
  }

  const ids = (defs ?? []).map((d) => d.id);
  const { data: examples, error: exampleError } = await supabase
    .schema("content_ir")
    .from("kind_example")
    .select("kind_definition_id,data,is_canonical,updated_at")
    .in("kind_definition_id", ids)
    .eq("is_canonical", true)
    .is("deleted_at", null);
  if (exampleError) {
    throw new Error(`kind_example read failed: ${exampleError.message}`);
  }

  const exampleByDef = new Map(
    (examples ?? []).map((e) => [e.kind_definition_id, e.data]),
  );

  const byKind = new Map((defs ?? []).map((d) => [d.kind, d]));
  const kinds: DemoKind[] = [];
  for (const slug of CANDIDATE_KINDS) {
    if (kinds.length >= MAX_KINDS) break;
    const def = byKind.get(slug);
    if (!def) continue;
    const example = exampleByDef.get(def.id);
    if (typeof example !== "object" || example === null || Array.isArray(example))
      continue;
    const metadata = (def.metadata ?? {}) as Record<string, unknown>;
    kinds.push({
      kind: def.kind,
      label: def.label,
      loadingComponent:
        typeof metadata.loading_component === "string"
          ? metadata.loading_component
          : null,
      example: example as Record<string, unknown>,
    });
  }

  return <StreamingOptionsDemo kinds={kinds} />;
}
