/**
 * Artifact persistence adapters — how an artifact's interactive state is saved.
 *
 * Two strategies (see the registry's `persistenceStrategy`):
 *  - GENERIC: state lives on the artifact itself (canvas_item_state), per viewer.
 *  - CUSTOM: a type with its own domain table (flashcards → user_flashcard_*,
 *    quiz → quiz_sessions, tasks → ctx_tasks) plugs in an adapter that creates +
 *    links the domain record on materialize and reads/writes state there.
 *
 * Wave C ships the interface + GENERIC adapter. Wave D registers custom adapters.
 */

import { canvasItemStateService } from "@/features/canvas/services/canvasItemStateService";

/** Pointer to a custom domain record (mirrors cx_artifact.external_system/_id). */
export interface ArtifactLink {
  externalSystem?: string;
  externalId?: string;
}

/** Context handed to a custom adapter's onMaterialize. */
export interface MaterializedArtifactInfo {
  artifactId: string; // canvas_items.id
  canvasType: string;
  title: string;
  rawContent: string;
  sourceMessageId: string;
  conversationId: string;
}

export interface ArtifactPersistenceAdapter<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Called once when a render block is materialized into canvas_items. Custom
   * adapters create the domain record and return its link to store on the
   * artifact. Idempotent (dedupe on message_id/natural key) — reconcile may
   * call it again. Generic adapter omits this (state lives on the artifact).
   */
  onMaterialize?(info: MaterializedArtifactInfo): Promise<ArtifactLink | void>;
  /** Load this viewer's interactive state for the artifact. */
  loadState(artifactId: string, link?: ArtifactLink): Promise<TState | null>;
  /** Merge-save this viewer's interactive state. */
  saveState(
    artifactId: string,
    patch: Partial<TState>,
    link?: ArtifactLink,
  ): Promise<boolean>;
}

/** Generic adapter: state on canvas_item_state, keyed (canvas_id, user_id). */
export const GENERIC_ADAPTER: ArtifactPersistenceAdapter = {
  loadState: (artifactId) => canvasItemStateService.getState(artifactId),
  saveState: (artifactId, patch) =>
    canvasItemStateService.saveState(
      artifactId,
      patch as Record<string, unknown>,
    ),
};

import { FLASHCARDS_ADAPTER } from "./flashcards-adapter";
import { QUIZ_ADAPTER } from "./quiz-adapter";
import { TASKS_ADAPTER } from "./tasks-adapter";

/** adapter key → adapter. */
export const ADAPTERS: Record<string, ArtifactPersistenceAdapter> = {
  generic: GENERIC_ADAPTER,
  flashcards: FLASHCARDS_ADAPTER,
  quiz: QUIZ_ADAPTER,
  tasks: TASKS_ADAPTER,
};

/** Resolve an adapter by key, defaulting to the generic adapter. */
export function getAdapter(key?: string): ArtifactPersistenceAdapter {
  return (key && ADAPTERS[key]) || GENERIC_ADAPTER;
}
