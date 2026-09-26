import { redirect } from "next/navigation";
import { sourceStudioPath } from "@/features/source-studio/sourceStudioModel";

/**
 * /rag/library/[id]/preview and /knowledge/library/[id]/preview — the old
 * library preview. Redirects to the one Source screen with its params
 * (`?page=`, `?chunk=`, `?assets=1`), SOURCE-CONVERGENCE §8.2.
 */
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OldPreviewRedirect({ params, searchParams }: PageProps) {
  const { id } = await params;
  redirect(sourceStudioPath(id, await searchParams));
}
