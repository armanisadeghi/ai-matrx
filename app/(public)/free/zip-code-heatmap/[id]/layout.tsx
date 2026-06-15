import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let title = "Saved Heatmap";
  let description = "View a saved zip-code heatmap.";

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("heatmap_saves")
      .select("title, description")
      .eq("id", id)
      .maybeSingle();

    if (data?.title) title = data.title;
    if (data?.description) {
      description = data.description.slice(0, 120);
    }
  } catch {
    // Fall back to generic heatmap metadata.
  }

  return createDynamicRouteMetadata("/free/zip-code-heatmap", {
    title,
    description,
    letter: "Zh",
  });
}

export default function ZipCodeHeatmapDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
