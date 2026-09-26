import { redirect } from "next/navigation";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";

/**
 * /rag/viewer/[id] and /knowledge/viewer/[id] — the old document viewer.
 * Every Source now opens on the one Source screen; citation deep links keep
 * `?page=` / `?chunk=` (SOURCE-CONVERGENCE §8.2).
 */
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OldViewerRedirect({ params, searchParams }: PageProps) {
  const { id } = await params;
  redirect(sourceStudioPath(id, await searchParams));
}
