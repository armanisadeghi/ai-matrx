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
//   defaults       → THE ARCHIVED-ITEMS LAW's user knob (see below).
//
// The headless catalog itself is built in `lib/agents/catalog.ts` (client,
// identity, transport, errorSink, notifier).

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentCatalogProvider } from "@ai-matrx/agents/catalog/react";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { getAgentCatalog, toCatalogArchiveFilter } from "@/lib/agents/catalog";
import { createArchiveKnobReconciler } from "@/lib/agents/archiveKnobReconciler";
import { openAgentPeek } from "@/features/agents/components/agent-listings/openAgentPeek";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectArchivedDefault } from "@/lib/redux/preferences/userPreferenceSelectors";

/**
 * 🚨 THE LATE-KNOB PROBLEM, catalog edition.
 *
 * `lib/entity-list/useEntityList.ts` met this first and its note is the ruling:
 * the preferences slice is a warm cache that rehydrates AFTER first paint, so a
 * default read once at mount is a setting that was written, persisted, and then
 * ignored — worse than no knob at all, because the setting says one thing and
 * the screen does another.
 *
 * The catalog freezes `defaults.archiveFilter` at creation and applies it to
 * each consumer at registration, so this host reconciles: an UNTOUCHED archive
 * axis follows the knob whenever it lands, and the moment a person moves the
 * control on a picker their choice owns that picker's axis for the rest of the
 * session. "Untouched" is not guessed — it is the exact value this host last
 * put there (or the catalog's own creation default, for a consumer seen for the
 * first time). Anything else is the person's, including a per-consumer
 * `initialArchFilter` override, which is never overwritten.
 */
export function AgentCatalogHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const archiveFilter = toCatalogArchiveFilter(
    useAppSelector(selectArchivedDefault),
  );

  // The knob's value at first render seeds the catalog; the effect below owns
  // every later value. Reading it through a ref keeps catalog creation the
  // once-per-process event the package's `globalThis` registry expects.
  const seedRef = useRef(archiveFilter);
  const catalog = useMemo(
    () => getAgentCatalog({ archiveFilter: seedRef.current }),
    [],
  );
  const navigate = useCallback((href: string) => router.push(href), [router]);

  // ONE reconciler for the life of the catalog. Rebuilding it on every knob
  // change would forget which pickers a person had already taken over, and the
  // next flip of the setting would yank them back — the opposite of the rule.
  const reconciler = useMemo(
    () =>
      createArchiveKnobReconciler({
        creationDefault: catalog.consumerDefaults.archFilter,
        getConsumers: () => catalog.getState().consumers,
        apply: (consumerId, archFilter) =>
          catalog.setConsumerFilter(consumerId, { archFilter }),
      }),
    [catalog],
  );

  useEffect(() => {
    const reconcile = () => reconciler.reconcile(archiveFilter);
    reconcile();
    return catalog.subscribe(reconcile);
  }, [catalog, reconciler, archiveFilter]);

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
