import "server-only";

import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/database.types";

export const COMMERCE_KIND_SLUGS = [
  "intake_photo_grouping",
  "item_vision_extraction",
  "lot_detection",
  "product_research",
  "value_assessment",
  "asset_grading",
  "enrichment_verification",
  "pricing_proposal",
  "listing_draft",
  "review_verdict",
  "publish_preflight",
] as const;

export interface CommerceExample {
  kind: (typeof COMMERCE_KIND_SLUGS)[number];
  label: string;
  version: number;
  validationStatus: string;
  data: Json;
}

export async function loadCommerceExamples(): Promise<{
  examples: CommerceExample[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: definitions, error: definitionError } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id, kind, label, version")
      .in("kind", [...COMMERCE_KIND_SLUGS])
      .eq("is_active", true)
      .is("deleted_at", null);

    if (definitionError)
      return { examples: [], error: definitionError.message };
    const ids = (definitions ?? []).map((row) => row.id);
    if (ids.length === 0)
      return {
        examples: [],
        error: "No active commerce kinds were visible to this session.",
      };

    const { data: examples, error: exampleError } = await supabase
      .schema("content_ir")
      .from("kind_example")
      .select("kind_definition_id, data, validation_status")
      .in("kind_definition_id", ids)
      .eq("is_canonical", true)
      .is("deleted_at", null);

    if (exampleError) return { examples: [], error: exampleError.message };
    const byDefinition = new Map(
      (examples ?? []).map((row) => [row.kind_definition_id, row]),
    );
    const byKind = new Map((definitions ?? []).map((row) => [row.kind, row]));

    return {
      examples: COMMERCE_KIND_SLUGS.flatMap((kind) => {
        const definition = byKind.get(kind);
        if (!definition) return [];
        const example = byDefinition.get(definition.id);
        if (!example) return [];
        return [
          {
            kind,
            label: definition.label,
            version: definition.version,
            validationStatus: example.validation_status,
            data: example.data,
          },
        ];
      }),
      error: null,
    };
  } catch (cause) {
    return {
      examples: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
