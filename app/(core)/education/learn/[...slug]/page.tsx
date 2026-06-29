import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { LearnArticle } from "@/features/education/components/LearnArticle";
import { LEARN_DOC_BY_SLUG } from "@/features/education/data/learn-content";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEARN_DOC_BY_SLUG[slug.join("/")];
  if (!doc) {
    return createDynamicRouteMetadata("/education", {
      title: "Study guide",
      description: "AI Matrx Education",
      letter: "Lr",
    });
  }
  return createDynamicRouteMetadata("/education", {
    title: doc.title,
    description: doc.summary,
    letter: doc.letter,
  });
}

export default async function LearnArticlePage({ params }: Props) {
  const { slug } = await params;
  const doc = LEARN_DOC_BY_SLUG[slug.join("/")];
  if (!doc) notFound();
  return <LearnArticle doc={doc} />;
}
