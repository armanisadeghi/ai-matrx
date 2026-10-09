import { Suspense } from "react";

import { SpacePage } from "@/features/spaces/page/SpacePage";
import { readSpacePage, type SpacePageReads } from "@/features/spaces/page/space-page-seed.server";

// Round 34: the page is read on the server as the person (its text is in the HTML). Round 36: nothing holds
// the first flush — the shell goes out at once, the page's body as soon as the page itself is read, and
// every database block's first reads stream in behind it (features/spaces/page/space-page-seed.server.ts).
export default async function SpaceRoute({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return (
    <Suspense fallback={<div className="spaces-page" aria-busy="true" />}>
      <SpaceBody spaceId={spaceId} reads={readSpacePage(spaceId)} />
    </Suspense>
  );
}

async function SpaceBody({ spaceId, reads }: { spaceId: string; reads: Promise<SpacePageReads> }) {
  const { doc, seeds, links, backlinks } = await reads;
  return <SpacePage spaceId={spaceId} initialDoc={doc} seeds={seeds} links={links} backlinks={backlinks} />;
}
