import {
  eduOgContentType,
  eduOgSize,
  renderEduOgImage,
} from "@/features/education/publishing/ogImage";
import { getAxisEntry } from "@/features/education/data/registry";

export const runtime = "nodejs";
export const alt = "AI Matrx Education";
export const size = eduOgSize;
export const contentType = eduOgContentType;

export default async function AxisOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getAxisEntry("features", slug);
  return renderEduOgImage({
    eyebrow: "Feature",
    title: entry?.name ?? "AI Matrx Education",
    description: entry?.description ?? entry?.tagline,
    letter: entry?.letter ?? "Ed",
  });
}
