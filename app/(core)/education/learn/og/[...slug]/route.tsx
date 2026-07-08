import { renderEduOgImage } from "@/features/education/publishing/ogImage";
import { getPublishedLearnDoc } from "@/features/education/publishing/queries";

export const runtime = "nodejs";

// Catch-all learn slugs can't host file-based opengraph-image.tsx (Next.js
// requires catch-all to be the final segment). This route handler serves the
// same branded card; page metadata points here via ogImage.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const doc = await getPublishedLearnDoc(slug.join("/"));
  return renderEduOgImage({
    eyebrow: "Study Guide",
    title: doc?.title ?? "Study guide",
    description: doc?.summary,
    letter: doc?.letter ?? "Lr",
  });
}
