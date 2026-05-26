import AnnotateShellClient from "./AnnotateShellClient";

/**
 * /image-studio/annotate
 *
 * Header + outer chrome are owned by `(tools)/layout.tsx`.
 */

interface PageProps {
  searchParams: Promise<{
    url?: string;
    cloudFileId?: string;
    folder?: string;
  }>;
}

export default async function AnnotatePage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <AnnotateShellClient
      urlParam={params.url ?? null}
      cloudFileId={params.cloudFileId ?? null}
      folder={params.folder}
    />
  );
}
