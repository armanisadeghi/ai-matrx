// One map's workspace shell.
//
// Deliberately thin, like the content plan's site shell: it mounts the header
// (an EntityModeHeader that portals into the shell's centre zone) once for all
// six screens, so switching views never remounts the nav — and never puts
// `{children}` behind unconditional vertical clipping.
//
// The map id is a plain UUID, not a dual-mode key: `seo.topical_map` has no
// slug column, so there is nothing to canonicalize.

import { TopicalMapHeader } from "@/features/marketing/seo/topical-map/components/TopicalMapHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

export default async function BrandTopicalMapLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return (
    <>
      <PageHeader>
        <TopicalMapHeader mapId={mapId} />
      </PageHeader>
      {children}
    </>
  );
}
