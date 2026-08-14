import type { createClient } from "@/utils/supabase/server";

type MainSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ResearchLineageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchLineageValidationError";
  }
}

function normalizeIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
    throw new ResearchLineageValidationError(
      `${label} must be an array of UUIDs.`,
    );
  }
  const ids = Array.from(new Set(value));
  if (ids.length > 100) {
    throw new ResearchLineageValidationError(
      `${label} cannot contain more than 100 items.`,
    );
  }
  if (!ids.every((id) => UUID_RE.test(id))) {
    throw new ResearchLineageValidationError(
      `${label} contains an invalid UUID.`,
    );
  }
  return ids;
}

async function assertReadableIds(
  supabase: MainSupabaseClient,
  table: "rs_topic" | "rs_tag",
  ids: string[],
  label: string,
): Promise<void> {
  if (ids.length === 0) return;
  const response =
    table === "rs_topic"
      ? await supabase
          .schema("research")
          .from("rs_topic")
          .select("id")
          .in("id", ids)
          .is("deleted_at", null)
      : await supabase
          .schema("research")
          .from("rs_tag")
          .select("id")
          .in("id", ids);
  if (response.error) throw response.error;
  if (response.data.length !== ids.length) {
    throw new ResearchLineageValidationError(
      `One or more ${label} do not exist or are not available to you.`,
    );
  }
}

/** Validate cross-project research ids under the caller's Main-project RLS. */
export async function validateResearchLineageIds(
  supabase: MainSupabaseClient,
  rawTopicIds: unknown,
  rawTagIds: unknown,
): Promise<{ topicIds: string[]; tagIds: string[] }> {
  const topicIds = normalizeIds(rawTopicIds, "researchTopicIds");
  const tagIds = normalizeIds(rawTagIds, "researchTagIds");
  await Promise.all([
    assertReadableIds(supabase, "rs_topic", topicIds, "research topics"),
    assertReadableIds(supabase, "rs_tag", tagIds, "research tags"),
  ]);
  return { topicIds, tagIds };
}
