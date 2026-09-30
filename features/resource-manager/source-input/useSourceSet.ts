"use client";

/**
 * useSourceSet(surfaceKey) — the web app's BINDING of the one Source input's
 * core (`@ai-matrx/agents/sources/runtime` + `/react`, USI-7 "one core, many
 * screens") to Redux. Every rule — adding, settling, one card per Source,
 * restore after a reload, the payload, the measurement, resolve with display
 * names — lives in the package; this file only says WHERE the state lives:
 *
 *   - cards: the EXISTING `instanceResources` machinery (no parallel slice),
 *     keyed by `source-input:<surfaceKey>`; each card is a `ManagedResource`
 *     of block type `source_ref` whose `source` is its `SourceDraft` and whose
 *     `preview` is the server's manifest entry;
 *   - the draft a reload reads back: the generic `wizardDraft` primitive
 *     (IDB + localStorage, cross-tab), wizardId `source-input:<surfaceKey>`
 *     holding `{ sources, topic }`;
 *   - the doors: `sourcesClient` (typed `apiPost`, `sourceSetApi.ts`).
 *
 * A host that needs the payload calls `useSourceSet` with the SAME
 * `surfaceKey` it gave `<SourceInput>` — both read the same Redux entry.
 */

import { useMemo, useSyncExternalStore } from "react";
import {
  useSourceSet as useSourceSetCore,
  type UseSourceSetResult,
} from "@ai-matrx/agents/sources/react";
import {
  isSourceDraft,
  type SourceCardModel,
  type SourceDelivery,
  type SourceSetAdapter,
  type SourceSetState,
} from "@ai-matrx/agents/sources/runtime";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import {
  addResource,
  initInstanceResources,
  removeResource,
  reorderResources,
  setResourcePreview,
  setResourceSource,
  setResourceStatus,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { patchWizardDraft, selectWizardDraft } from "@/lib/redux/slices/wizardDraftSlice";
import { generateResourceId } from "@/features/agents/redux/execution-system/utils/ids";
import type { ManagedResource } from "@/features/agents/types/instance.types";
import { sourceRefusalSentence } from "@/features/sources/api/sourcesApi";
import { useSyncHydrated } from "@/lib/sync/useSyncHydrated";
import { sourcesClient } from "./sourceSetApi";

export type { UseSourceSetResult };

/** The instanceResources key (and wizardDraft id) for one surface's Source input. */
export function sourceSurfaceKey(surfaceKey: string): string {
  return `source-input:${surfaceKey}`;
}

const EMPTY_RESOURCES: Record<string, ManagedResource> = {};

/** The device store does not exist on the server: there, the draft is never "known empty". */
const noSubscribe = () => () => {};
const onClientSnapshot = () => true;
const onServerSnapshot = () => false;

function toCard(resource: ManagedResource): SourceCardModel | null {
  if (resource.blockType !== "source_ref" || !isSourceDraft(resource.source)) return null;
  return {
    id: resource.resourceId,
    draft: resource.source,
    status: resource.status,
    error: resource.errorMessage,
    manifest: (resource.preview as SourceManifestEntry | null) ?? null,
  };
}

function sortedResources(resources: Record<string, ManagedResource>): ManagedResource[] {
  return Object.values(resources).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The Redux adapter for one surface: the runtime's store over
 * `instanceResources[key]` (+ the topic in `wizardDraft[key]`), and the draft
 * storage over `wizardDraft[key]`. `getState` is memoized on the two slices it
 * reads, so it returns the SAME object until something changes.
 */
export function reduxSourceSetAdapter(store: AppStore, key: string): SourceSetAdapter {
  let lastResources: Record<string, ManagedResource> | null = null;
  let lastTopic: string | null = null;
  let lastState: SourceSetState | null = null;

  const liveResources = () => store.getState().instanceResources.byConversationId[key] ?? EMPTY_RESOURCES;
  const savedData = () => selectWizardDraft(key)(store.getState())?.data;
  const savedTopic = () => {
    const topic = savedData()?.topic;
    return typeof topic === "string" ? topic : "";
  };

  const getState = (): SourceSetState => {
    const resources = liveResources();
    const topic = savedTopic();
    if (lastState && resources === lastResources && topic === lastTopic) return lastState;
    lastResources = resources;
    lastTopic = topic;
    lastState = {
      cards: sortedResources(resources)
        .map(toCard)
        .filter((c): c is SourceCardModel => c !== null),
      topic,
    };
    return lastState;
  };

  const ensureEntry = () => {
    if (!store.getState().instanceResources.byConversationId[key]) {
      store.dispatch(initInstanceResources({ conversationId: key }));
    }
  };

  const setState = (next: SourceSetState) => {
    ensureEntry();
    const live = liveResources();
    const wanted = new Set(next.cards.map((c) => c.id));
    for (const resource of Object.values(live)) {
      if (resource.blockType === "source_ref" && !wanted.has(resource.resourceId)) {
        store.dispatch(removeResource({ conversationId: key, resourceId: resource.resourceId }));
      }
    }
    for (const card of next.cards) {
      const resource = liveResources()[card.id];
      if (!resource) {
        store.dispatch(
          addResource({ conversationId: key, blockType: "source_ref", source: card.draft, resourceId: card.id }),
        );
      } else if (resource.source !== card.draft) {
        store.dispatch(setResourceSource({ conversationId: key, resourceId: card.id, source: card.draft }));
      }
      const now = liveResources()[card.id];
      // The preview write also marks the resource ready — the status is written after it.
      if (card.manifest && now?.preview !== card.manifest) {
        store.dispatch(setResourcePreview({ conversationId: key, resourceId: card.id, preview: card.manifest }));
      }
      const after = liveResources()[card.id];
      if (after && (after.status !== card.status || after.errorMessage !== card.error)) {
        store.dispatch(
          setResourceStatus({
            conversationId: key,
            resourceId: card.id,
            status: card.status,
            errorMessage: card.error ?? undefined,
          }),
        );
      }
    }
    const order = sortedResources(liveResources())
      .filter((r) => r.blockType === "source_ref")
      .map((r) => r.resourceId);
    const wantedOrder = next.cards.map((c) => c.id);
    if (order.join("\u0000") !== wantedOrder.join("\u0000")) {
      store.dispatch(reorderResources({ conversationId: key, orderedIds: wantedOrder }));
    }
    if (savedTopic() !== next.topic) {
      store.dispatch(patchWizardDraft({ wizardId: key, patch: { topic: next.topic } }));
    }
  };

  return {
    store: {
      getState,
      setState,
      subscribe: (listener) => store.subscribe(listener),
      init: ensureEntry,
    },
    persistence: {
      load: savedData,
      save: (value) =>
        store.dispatch(patchWizardDraft({ wizardId: key, patch: { sources: value.sources, topic: value.topic } })),
      subscribe: (listener) => store.subscribe(listener),
    },
    client: sourcesClient,
    createId: generateResourceId,
    describeError: sourceRefusalSentence,
  };
}

export function useSourceSet(
  surfaceKey: string,
  options: {
    defaultForm?: string;
    organizationId?: string;
    /** What the host can use (the input's `deliveries` prop) — `fitDeliveries()` switches the rest back. */
    deliveries?: readonly SourceDelivery[];
    /** Most Sources the host takes (the input's `max` prop) — `roomLeft()` counts against it. */
    max?: number;
  } = {},
): UseSourceSetResult {
  const store = useAppStore();
  const key = sourceSurfaceKey(surfaceKey);
  const adapter = useMemo(() => reduxSourceSetAdapter(store, key), [store, key]);
  const syncHydrated = useSyncHydrated();
  const onClient = useSyncExternalStore(noSubscribe, onClientSnapshot, onServerSnapshot);
  return useSourceSetCore(adapter, {
    persistenceReady: onClient && syncHydrated,
    config: {
      defaultForm: options.defaultForm,
      organizationId: options.organizationId,
      deliveries: options.deliveries,
      max: options.max,
    },
  });
}
