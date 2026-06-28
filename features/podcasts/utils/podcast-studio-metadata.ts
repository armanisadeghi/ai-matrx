import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

/** Single-letter podcast favicon — matches `/podcast` in favicon-route-data. */
export const PODCAST_FAVICON_LETTER = "J";

export async function createPodcastStudioRunMetadata(
  runId: string,
  options?: { titlePrefix?: string },
) {
  const titlePrefix = options?.titlePrefix ?? "Run";
  let title = "Podcast Run";
  let description = "AI podcast studio production run.";

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("podcast").from("pc_studio_runs")
      .select("title, description")
      .eq("id", runId)
      .maybeSingle();

    if (data?.title) title = data.title;
    if (data?.description) {
      description = data.description.slice(0, 120);
    }
  } catch {
    // Fall back to generic run metadata.
  }

  return createDynamicRouteMetadata("/podcast", {
    titlePrefix,
    title,
    description,
    letter: PODCAST_FAVICON_LETTER,
  });
}
