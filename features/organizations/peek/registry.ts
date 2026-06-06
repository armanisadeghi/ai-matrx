/**
 * Peek registry — catalogue key → lazy peek component.
 *
 * Each kind's peek lives in ./kinds/<Kind>Peek.tsx with a `default` export of
 * `ComponentType<PeekProps>`. Register it here (one line) and it lights up the
 * "Peek" action on that kind's resource rows. Kinds not in the registry show
 * "Peek — coming soon".
 *
 * Keyed by catalogue key (e.g. 'agent', 'file', 'note') — the same key the
 * resource page uses.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PeekProps } from "./types";

export const PEEK_REGISTRY: Record<
  string,
  LazyExoticComponent<ComponentType<PeekProps>>
> = {
  agent: lazy(() => import("./kinds/AgentPeek")),
  file: lazy(() => import("./kinds/FilePeek")),
  note: lazy(() => import("./kinds/NotePeek")),
  agent_app: lazy(() => import("./kinds/AgentAppPeek")),
  skill: lazy(() => import("./kinds/SkillPeek")),
  workflow: lazy(() => import("./kinds/WorkflowPeek")),
  content_template: lazy(() => import("./kinds/ContentTemplatePeek")),
  conversation: lazy(() => import("./kinds/ConversationPeek")),
  flashcard: lazy(() => import("./kinds/FlashcardPeek")),
  canvas: lazy(() => import("./kinds/CanvasPeek")),
  task: lazy(() => import("./kinds/TaskPeek")),
  dataset: lazy(() => import("./kinds/DatasetPeek")),
  transcript: lazy(() => import("./kinds/TranscriptPeek")),
  // Add new kinds here as their peek components land.
};

export function hasPeek(key: string): boolean {
  return key in PEEK_REGISTRY;
}
