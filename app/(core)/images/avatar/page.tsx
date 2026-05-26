import AvatarShellClient from "./AvatarShellClient";

/**
 * /image-studio/avatar
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

export default async function AvatarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <AvatarShellClient
      urlParam={params.url ?? null}
      cloudFileId={params.cloudFileId ?? null}
      folder={params.folder}
    />
  );
}
