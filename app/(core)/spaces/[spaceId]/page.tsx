import { SpacePage } from "@/features/spaces/page/SpacePage";
import { readSpacePage } from "@/features/spaces/page/space-page-seed.server";

// Round 34: the page is read on the server as the person (its text is in the HTML) and its inline
// tables' first rows stream in behind it (features/spaces/page/space-page-seed.server.ts).
export default async function SpaceRoute({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const { doc, tables } = await readSpacePage(spaceId);
  return <SpacePage spaceId={spaceId} initialDoc={doc} tablesSeed={tables} />;
}
