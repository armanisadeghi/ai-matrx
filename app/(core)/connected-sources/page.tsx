import { BrowseEverything } from "@/features/connected-sources/components/BrowseEverything";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/connected-sources", {
  title: "Connected Sources",
  description:
    "Browse what is really inside the accounts you connected — files, docs, comments and revisions.",
  letter: "CS",
});

/** /connected-sources — what is really inside the accounts you connected. */
export default function ConnectedSourcesPage() {
  return <BrowseEverything />;
}
