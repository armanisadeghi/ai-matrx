"use client";

// providers/AgentCatalogHost.tsx
//
// THE ONE `@ai-matrx/agents/catalog` mount. Everything the agent picker knows
// — the rows, the tabs, the sort, the search, the filters, the favourites,
// the counts, the freshness, the mandate-resolved default row — lives in the
// package behind this provider. A second mount anywhere would build a second
// view-state registry, so there is exactly one, here, inside StoreProvider
// (the catalog's identity and transport ports read Redux).
//
// C22 CENSUS — every port below INJECTS APP IDENTITY, nothing more:
//
//   LinkComponent  → `next/link`, so a cmd-click on a row prefetches and
//                    opens like every other link in this app.
//   navigate       → the Next router's `push` (the package default would be
//                    a full `window.location.assign` page load).
//   renderModelRef → `AiModelRef`, this app's canonical model door.
//   openPeek       → the canonical `AgentSneakPeekModal`, opened as a
//                    non-blocking WindowPanel through the overlay system.
//
// The headless catalog itself is built in `lib/agents/catalog.ts` (client,
// identity, transport, errorSink, notifier).

import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentCatalogProvider } from "@ai-matrx/agents/catalog/react";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { getAgentCatalog } from "@/lib/agents/catalog";
import { openAgentPeek } from "@/features/agents/components/agent-listings/openAgentPeek";

export function AgentCatalogHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const catalog = useMemo(() => getAgentCatalog(), []);
  const navigate = useCallback((href: string) => router.push(href), [router]);

  // TODO(archived-items-law A2, blocked on @ai-matrx/agents 0.9.2):
  // pass `defaults={{ archiveFilter }}` here, read from
  // `selectArchivedDefault` (lib/redux/preferences/userPreferenceSelectors),
  // so the agent picker starts from the SAME user knob every entity-list
  // surface already honours. 0.9.1 is the latest published version and does
  // not expose the prop yet (lane A1 ships it). Register row:
  // ../common-docs/projects/archived-items-law/STATUS.md → A2.
  return (
    <AgentCatalogProvider
      catalog={catalog}
      LinkComponent={Link}
      navigate={navigate}
      renderModelRef={({ modelId, className }) => (
        <AiModelRef modelId={modelId} className={className} />
      )}
      openPeek={(agent) => openAgentPeek(agent.id)}
    >
      {children}
    </AgentCatalogProvider>
  );
}
