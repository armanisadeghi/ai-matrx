import { SourceStudio } from "@/features/source-studio/components/SourceStudio";
import { parseSourceDeepLink } from "@/features/source-studio/sourceStudioModel";

/**
 * /knowledge/sources/<processed_document_id> — THE Source screen
 * (SOURCE-CONVERGENCE §8.2). Every kind of Source opens here; every old viewer
 * route (`/knowledge/viewer/[id]`, `/rag/viewer/[id]`,
 * `/knowledge/library/[id]/preview`, `/tools/pdf-extractor/[id]`) redirects
 * here with `?page=` / `?chunk=` / `?assets=` intact, and the screen opens on
 * that portion or chunk.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SourcePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const deepLink = parseSourceDeepLink(await searchParams);
  return <SourceStudio key={id} documentId={id} deepLink={deepLink} />;
}
