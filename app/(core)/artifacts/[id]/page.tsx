import { CmsArtifactDetail } from "@/features/artifacts/components/CmsArtifactDetail";

interface ArtifactDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArtifactDetailPage({
  params,
}: ArtifactDetailPageProps) {
  const { id } = await params;

  return (
    <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-6 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <div className="max-w-[1400px] mx-auto">
        <CmsArtifactDetail artifactId={id} />
      </div>
    </div>
  );
}
