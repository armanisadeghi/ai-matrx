import { notFound } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { dotDirFromRouteSlug } from "@/features/feature-docs/constants";
import FeatureDocsShell from "@/features/feature-docs/components/FeatureDocsShell";
import FeatureDocsTable from "@/features/feature-docs/components/FeatureDocsTable";

interface DotDirPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: DotDirPageProps) {
  const { slug } = await params;
  const dir = dotDirFromRouteSlug(slug);
  return createRouteMetadata(`/administration/feature-docs/dotdirs/${slug}`, {
    titlePrefix: "Feature Docs",
    title: dir ?? slug,
    letter: "Fd",
  });
}

export default async function FeatureDocsDotDirPage({
  params,
}: DotDirPageProps) {
  const { slug } = await params;
  const dotDir = dotDirFromRouteSlug(slug);
  if (!dotDir) notFound();

  return (
    <FeatureDocsShell
      zone="dotdir"
      dotDir={dotDir}
      title={dotDir}
      subtitle={`${dotDir}/**/*.md`}
    >
      <FeatureDocsTable zone="dotdir" dotDir={dotDir} />
    </FeatureDocsShell>
  );
}
