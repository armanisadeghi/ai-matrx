"use client";

/**
 * useSourceSet(surfaceKey) — THE client handler for the one Source input.
 *
 * State lives in the EXISTING `instanceResources` machinery (no parallel
 * slice), keyed by the surface instance `source-input:<surfaceKey>` instead of
 * a chat conversation: each picked Source is a `ManagedResource` of block type
 * `source_ref` whose `source` is its `SourceDraft` (the pointer) and whose
 * `preview` is the server's manifest entry (sizes, forms, parts, state).
 *
 * Draft persistence is EXPLICIT: every change writes the draft list through
 * the generic `wizardDraft` primitive (IDB + localStorage, cross-tab), so a
 * refresh keeps the picks. A Source that was still being added when the page
 * reloaded keeps what the person handed over (`SourceDraft.input`) and is
 * picked up again by the input (`interrupted.ts`); a file cut off mid-upload
 * says so and keeps its name — never silently dropped, never shown as if it
 * finished.
 *
 * It speaks the frozen v1 wire contract only: `toSourceSet()` builds the
 * `SourceSet`, `manifest()` asks `POST /sources/manifest`, `resolve()` asks
 * `POST /sources/resolve`.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createSourceRef,
  createSourceSet,
  type ResolvedSourceSet,
  type SourceManifest,
  type SourceManifestEntry,
  type SourceRef,
  type SourceRefOptions,
  type SourceSet,
  totalChars as sumChars,
} from "@ai-matrx/agents/sources";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  addResource,
  initInstanceResources,
  removeResource,
  setResourcePreview,
  setResourceSource,
  setResourceStatus,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  patchWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";
import { generateResourceId } from "@/features/agents/redux/execution-system/utils/ids";
import type { ManagedResource } from "@/features/agents/types/instance.types";
import { fetchSourceManifest, resolveSourceSet } from "./sourceSetApi";
import { sourceRefusalSentence } from "@/features/sources/api/sourcesApi";
import { useSyncHydrated } from "@/lib/sync/useSyncHydrated";
import { reloadedCard } from "./interrupted";
import type { SourceCardModel, SourceDraft } from "./types";

export { RELOADED_WHILE_ADDING } from "./interrupted";

/** The instanceResources key for one surface's Source input. */
export function sourceSurfaceKey(surfaceKey: string): string {
  return `source-input:${surfaceKey}`;
}

interface PersistedCard {
  id: string;
  draft: SourceDraft;
  status: SourceCardModel["status"];
  error: string | null;
}

interface PersistedSourceInput {
  sources: PersistedCard[];
  topic: string;
}

const EMPTY_RESOURCES: Record<string, ManagedResource> = {};

/** The device store does not exist on the server: there, the draft is never "known empty". */
const noSubscribe = () => () => {};
const onClientSnapshot = () => true;
const onServerSnapshot = () => false;

function isDraft(value: unknown): value is SourceDraft {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as SourceDraft).kind === "string" &&
    typeof (value as SourceDraft).label === "string"
  );
}

function toCard(resource: ManagedResource): SourceCardModel | null {
  if (resource.blockType !== "source_ref" || !isDraft(resource.source))
    return null;
  return {
    id: resource.resourceId,
    draft: resource.source,
    status: resource.status,
    error: resource.errorMessage,
    manifest: (resource.preview as SourceManifestEntry | null) ?? null,
  };
}

function readPersisted(data: Record<string, unknown> | undefined): PersistedSourceInput {
  const sources = Array.isArray(data?.sources)
    ? (data.sources as PersistedCard[]).filter(
        (c) => c && typeof c.id === "string" && isDraft(c.draft),
      )
    : [];
  return { sources, topic: typeof data?.topic === "string" ? data.topic : "" };
}

function sameRef(a: SourceRef, b: SourceRef): boolean {
  return a.resource_type === b.resource_type && a.resource_id === b.resource_id;
}

export interface UseSourceSetResult {
  /** Every picked Source, in the order picked. */
  sources: SourceCardModel[];
  topic: string;
  setTopic: (topic: string) => void;
  /** Add a Source that is already a pointer (a stored record, a landed Source). */
  addReady: (draft: SourceDraft) => string;
  /** Add a Source that is still landing; finish it with `settle` or `fail`. */
  addPending: (draft: Omit<SourceDraft, "ref">) => string;
  settle: (id: string, patch: Partial<SourceDraft> & { ref: SourceRef }) => void;
  fail: (id: string, sentence: string) => void;
  remove: (id: string) => void;
  /** Change the pointer's choices (form, parts, cap, delivery). */
  updateRef: (id: string, options: SourceRefOptions) => void;
  setWaitForClean: (id: string, wait: boolean) => void;
  /** How many Sources are picked RIGHT NOW (read from the store, never a stale render). */
  liveCount: () => number;
  /** True when this pointer is already picked (the "Your sources" list ticks it). */
  hasRef: (resourceType: string, resourceId: string) => boolean;
  /** The frozen v1 payload, built from the ready Sources. */
  toSourceSet: (options?: { targetModelId?: string }) => SourceSet;
  /** Apply a set the review page returned (forms, parts, caps, delivery). */
  applySourceSet: (set: SourceSet) => void;
  /** POST /sources/manifest for the ready Sources; cards update with it. */
  manifest: () => Promise<SourceManifest | null>;
  /** POST /sources/resolve — the grounded text for a generator. */
  resolve: (options?: { targetModelId?: string }) => Promise<ResolvedSourceSet>;
  /** Characters that will go in (the server's measurement; 0 until measured). */
  totalChars: number;
  measuring: boolean;
  /** Why the measurement failed, with its remedy. */
  manifestError: string | null;
  /** Every Source finished landing (nothing pending) and none failed. */
  settled: boolean;
  /**
   * The saved draft has not been read back yet (the device store loads a
   * moment after the page). While true, "nothing picked" is not known — show
   * a loading state, never an empty one. (Added by USI-3b.)
   */
  restoring: boolean;
  /** Put a failed or interrupted card back to "adding" to land it again. (USI-3b) */
  restart: (id: string) => void;
  /** Change what a card that is still landing says or keeps (label, input, fileId, notes). (USI-3b) */
  updateDraft: (id: string, patch: Partial<Omit<SourceDraft, "ref">>) => void;
}

export function useSourceSet(
  surfaceKey: string,
  options: { defaultForm?: string; organizationId?: string } = {},
): UseSourceSetResult {
  const key = sourceSurfaceKey(surfaceKey);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const resources = useAppSelector(
    (state: RootState) =>
      state.instanceResources.byConversationId[key] ?? EMPTY_RESOURCES,
  );
  const persistedEntry = useAppSelector(selectWizardDraft(key));
  const syncHydrated = useSyncHydrated();
  const onClient = useSyncExternalStore(noSubscribe, onClientSnapshot, onServerSnapshot);
  const persisted = readPersisted(persistedEntry?.data);
  const [measuring, setMeasuring] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const hydrated = useRef(false);
  /** The newest measurement wins: an older answer never overwrites a newer one. */
  const measurement = useRef<AbortController | null>(null);

  const sources = Object.values(resources)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toCard)
    .filter((c): c is SourceCardModel => c !== null);

  // ── Registry entry + restore the persisted draft once ────────────────────
  useEffect(() => {
    if (!store.getState().instanceResources.byConversationId[key]) {
      dispatch(initInstanceResources({ conversationId: key }));
    }
  }, [dispatch, store, key]);

  useEffect(() => {
    if (hydrated.current) return;
    const live = store.getState().instanceResources.byConversationId[key];
    if (live && Object.keys(live).length > 0) {
      hydrated.current = true;
      return;
    }
    if (persisted.sources.length === 0) return;
    hydrated.current = true;
    if (!live) dispatch(initInstanceResources({ conversationId: key }));
    for (const card of persisted.sources) {
      dispatch(
        addResource({
          conversationId: key,
          blockType: "source_ref",
          source: card.draft,
          resourceId: card.id,
        }),
      );
      // Cut off mid-landing: an error the input resolves (it re-lands the
      // kept input, or asks for the file again) — never a spinner forever.
      const reloaded = reloadedCard(card.draft, card.status);
      dispatch(
        setResourceStatus({
          conversationId: key,
          resourceId: card.id,
          status: reloaded ? "error" : card.status,
          errorMessage: reloaded ? reloaded.sentence : (card.error ?? undefined),
        }),
      );
    }
  }, [dispatch, store, key, persisted.sources]);

  /** Write the draft list as it is NOW in the store (explicit persistence). */
  const persist = (patch: Partial<PersistedSourceInput> = {}) => {
    hydrated.current = true;
    const live = store.getState().instanceResources.byConversationId[key] ?? {};
    const cards: PersistedCard[] = Object.values(live)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((r) => r.blockType === "source_ref" && isDraft(r.source))
      .map((r) => ({
        id: r.resourceId,
        draft: r.source as SourceDraft,
        status: r.status,
        error: r.errorMessage,
      }));
    const current = readPersisted(
      selectWizardDraft(key)(store.getState())?.data,
    );
    dispatch(
      patchWizardDraft({
        wizardId: key,
        patch: { sources: cards, topic: patch.topic ?? current.topic },
      }),
    );
  };

  const ensureEntry = () => {
    if (!store.getState().instanceResources.byConversationId[key]) {
      dispatch(initInstanceResources({ conversationId: key }));
    }
  };

  const withDefaultForm = (ref: SourceRef): SourceRef =>
    options.defaultForm && !ref.representation
      ? createSourceRef(ref.resource_type, ref.resource_id, {
          ...ref,
          representation: options.defaultForm,
        })
      : ref;

  const addReady = (draft: SourceDraft): string => {
    ensureEntry();
    const id = generateResourceId();
    const ref = draft.ref ? withDefaultForm(draft.ref) : null;
    dispatch(
      addResource({
        conversationId: key,
        blockType: "source_ref",
        source: { ...draft, ref },
        resourceId: id,
      }),
    );
    dispatch(
      setResourceStatus({ conversationId: key, resourceId: id, status: "ready" }),
    );
    persist();
    return id;
  };

  const addPending = (draft: Omit<SourceDraft, "ref">): string => {
    ensureEntry();
    const id = generateResourceId();
    dispatch(
      addResource({
        conversationId: key,
        blockType: "source_ref",
        source: { ...draft, ref: null },
        resourceId: id,
      }),
    );
    dispatch(
      setResourceStatus({ conversationId: key, resourceId: id, status: "resolving" }),
    );
    persist();
    return id;
  };

  const readDraft = (id: string): SourceDraft | null => {
    const r = store.getState().instanceResources.byConversationId[key]?.[id];
    return r && isDraft(r.source) ? r.source : null;
  };

  const settle: UseSourceSetResult["settle"] = (id, patch) => {
    const draft = readDraft(id);
    if (!draft) return; // removed while it was landing — nothing to finish
    dispatch(
      setResourceSource({
        conversationId: key,
        resourceId: id,
        // Landed: the kept input has done its job and leaves the draft.
        source: { ...draft, ...patch, input: undefined, ref: withDefaultForm(patch.ref) },
      }),
    );
    dispatch(setResourceStatus({ conversationId: key, resourceId: id, status: "ready" }));
    persist();
  };

  const fail: UseSourceSetResult["fail"] = (id, sentence) => {
    if (!readDraft(id)) return;
    dispatch(
      setResourceStatus({
        conversationId: key,
        resourceId: id,
        status: "error",
        errorMessage: sentence,
      }),
    );
    persist();
  };

  const restart = (id: string) => {
    if (!readDraft(id)) return;
    dispatch(setResourceStatus({ conversationId: key, resourceId: id, status: "resolving" }));
    persist();
  };

  const updateDraft: UseSourceSetResult["updateDraft"] = (id, patch) => {
    const draft = readDraft(id);
    if (!draft) return;
    dispatch(
      setResourceSource({ conversationId: key, resourceId: id, source: { ...draft, ...patch } }),
    );
    persist();
  };

  const remove = (id: string) => {
    dispatch(removeResource({ conversationId: key, resourceId: id }));
    persist();
  };

  const updateRef: UseSourceSetResult["updateRef"] = (id, refOptions) => {
    const draft = readDraft(id);
    if (!draft?.ref) return;
    const ref = createSourceRef(draft.ref.resource_type, draft.ref.resource_id, {
      ...draft.ref,
      ...refOptions,
    });
    dispatch(
      setResourceSource({ conversationId: key, resourceId: id, source: { ...draft, ref } }),
    );
    persist();
  };

  const setWaitForClean = (id: string, wait: boolean) => {
    const draft = readDraft(id);
    if (!draft) return;
    dispatch(
      setResourceSource({
        conversationId: key,
        resourceId: id,
        source: { ...draft, waitForClean: wait },
      }),
    );
    persist();
  };

  const setTopic = (topic: string) => {
    ensureEntry();
    persist({ topic });
  };

  const liveCount = () =>
    Object.values(store.getState().instanceResources.byConversationId[key] ?? {}).filter(
      (r) => r.blockType === "source_ref",
    ).length;

  const hasRef = (resourceType: string, resourceId: string) =>
    sources.some(
      (s) =>
        s.draft.ref?.resource_type === resourceType &&
        s.draft.ref.resource_id === resourceId,
    );

  const readyRefs = (): SourceRef[] => {
    const live = store.getState().instanceResources.byConversationId[key] ?? {};
    return Object.values(live)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toCard)
      .filter((c): c is SourceCardModel => !!c && c.status === "ready" && !!c.draft.ref)
      .map((c) => c.draft.ref as SourceRef);
  };

  const currentTopic = () =>
    readPersisted(selectWizardDraft(key)(store.getState())?.data).topic.trim();

  const toSourceSet: UseSourceSetResult["toSourceSet"] = (setOptions = {}) => {
    const topic = currentTopic();
    return createSourceSet(readyRefs(), {
      topic: topic || undefined,
      grounding: "whole",
      target_model_id: setOptions.targetModelId,
    });
  };

  const applySourceSet = (set: SourceSet) => {
    const live = store.getState().instanceResources.byConversationId[key] ?? {};
    for (const resource of Object.values(live)) {
      const card = toCard(resource);
      if (!card?.draft.ref) continue;
      const match = set.sources.find((r) => sameRef(r, card.draft.ref as SourceRef));
      if (!match) continue;
      dispatch(
        setResourceSource({
          conversationId: key,
          resourceId: card.id,
          source: { ...card.draft, ref: match },
        }),
      );
    }
    persist(set.topic !== undefined ? { topic: set.topic } : {});
  };

  const manifest = async (): Promise<SourceManifest | null> => {
    const refs = readyRefs();
    if (refs.length === 0) {
      setManifestError(null);
      return null;
    }
    measurement.current?.abort();
    const controller = new AbortController();
    measurement.current = controller;
    setMeasuring(true);
    try {
      const result = await fetchSourceManifest(createSourceSet(refs), {
        organizationId: options.organizationId,
        signal: controller.signal,
      });
      if (measurement.current !== controller) return null;
      const live = store.getState().instanceResources.byConversationId[key] ?? {};
      for (const resource of Object.values(live)) {
        const card = toCard(resource);
        if (!card?.draft.ref || card.status !== "ready") continue;
        const entry = result.sources.find((e) => sameRef(e.ref, card.draft.ref as SourceRef));
        if (entry) {
          dispatch(
            setResourcePreview({ conversationId: key, resourceId: card.id, preview: entry }),
          );
        }
      }
      setManifestError(null);
      return result;
    } catch (err) {
      // A superseded measurement was cancelled on purpose — not a failure.
      if (measurement.current !== controller) return null;
      setManifestError(
        `Sizes and parts could not be read: ${sourceRefusalSentence(err)} Your picks are kept — try again.`,
      );
      return null;
    } finally {
      if (measurement.current === controller) setMeasuring(false);
    }
  };

  const resolve: UseSourceSetResult["resolve"] = (resolveOptions = {}) =>
    resolveSourceSet(toSourceSet(resolveOptions), {
      organizationId: options.organizationId,
    });

  // THE one size rule (the package's `totalChars`): the chosen form, or the
  // picked parts, capped — measured against each card's CURRENT pointer.
  const measured = sources.flatMap((s) =>
    s.status === "ready" && s.manifest && s.draft.ref
      ? [{ ...s.manifest, ref: s.draft.ref }]
      : [],
  );
  const totalChars = measured.length
    ? sumChars({
        __kind: "source_manifest",
        sources: measured,
        total_chars: 0,
        estimated_tokens: 0,
        model_context_tokens: null,
      })
    : 0;

  return {
    sources,
    topic: persisted.topic,
    setTopic,
    addReady,
    addPending,
    settle,
    fail,
    remove,
    updateRef,
    setWaitForClean,
    liveCount,
    hasRef,
    toSourceSet,
    applySourceSet,
    manifest,
    resolve,
    totalChars,
    measuring,
    manifestError,
    settled: sources.every((s) => s.status === "ready"),
    // Not read back yet, or read back but the restore has not landed in the
    // store (one render between the two) — both would draw a false "empty".
    restoring:
      !onClient ||
      !syncHydrated ||
      (persisted.sources.length > 0 && Object.keys(resources).length === 0),
    restart,
    updateDraft,
  };
}
