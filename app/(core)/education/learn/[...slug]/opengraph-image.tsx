import {
  eduOgContentType,
  eduOgSize,
  renderEduOgImage,
} from "@/features/education/publishing/ogImage";
import { getPublishedLearnDoc } from "@/features/education/publishing/queries";

export const runtime = "nodejs";
export const alt = "AI Matrx study guide";
export const size = eduOgSize;
export const contentType = eduOgContentType;

export default async function LearnOgImage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const doc = await getPublishedLearnDoc(slug.join("/"));
  return renderEduOgImage({
    eyebrow: "Study Guide",
    title: doc?.title ?? "Study guide",
    description: doc?.summary,
    letter: doc?.letter ?? "Lr",
  });
}
