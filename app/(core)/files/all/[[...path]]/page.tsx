/**
 * app/(core)/files/all/[[...path]]/page.tsx
 *
 * Query-string hydration only — the visible shell lives in layout.tsx.
 * Layouts cannot read `searchParams`, so this page parses `?view=…&file=…`
 * and hands it to a one-shot client hydrator.
 */

import { FilesQueryHydrator } from "@/features/files/components/surfaces/FilesQueryHydrator";
import {
  readFilesUiFromParams,
  type ServerSearchParams,
} from "@/features/files/utils/server-search-params";

interface PageProps {
  searchParams?: Promise<ServerSearchParams>;
}

export default async function CloudFilesAllPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : undefined;
  const { initialUiPatch, initialFileId } = readFilesUiFromParams(sp);

  return (
    <FilesQueryHydrator
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
