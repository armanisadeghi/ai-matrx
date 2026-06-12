// app/(core)/knowledge-graph/page.tsx
//
// Legacy URL — the graph now lives under the Knowledge umbrella at
// `/knowledge/graph`. Kept around as a permanent redirect so old
// links, bookmarks, and OG-shared URLs continue to resolve, including
// the `?org=…&scope=…&scopeType=…` deep-link params the org workspace
// uses to filter the graph.

import { permanentRedirect } from "next/navigation";

export default async function LegacyKnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v != null) qs.set(k, v);
  }
  const target = qs.toString()
    ? `/knowledge/graph?${qs.toString()}`
    : "/knowledge/graph";
  permanentRedirect(target);
}
