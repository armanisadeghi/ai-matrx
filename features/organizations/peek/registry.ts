/**
 * Peek registry — catalogue key → code-split peek component.
 *
 * Each kind's peek lives in ./kinds/<Kind>Peek.tsx with a `default` export of
 * `ComponentType<PeekProps>`. Register it here (one line) and it lights up the
 * "Peek" action on that kind's resource rows. Kinds not in the registry show
 * "Peek — coming soon".
 *
 * Keyed by catalogue key (e.g. 'agent', 'file', 'note') — the same key the
 * resource page uses.
 *
 * Entries use `next/dynamic({ ssr: false })`, never `React.lazy` (code-splitting
 * doctrine rule 3): lazy SSRs by default, which compiled every peek's feature
 * graph (agents, files, notes, canvas, …) into the server pass of each org
 * route that statically reaches this registry via ResourcePeekHost.
 * `loading: () => null` matches the previous `<Suspense fallback={null}>` UX.
 */

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import type { PeekProps } from "./types";

const peek = (
  loader: () => Promise<{ default: ComponentType<PeekProps> }>,
): ComponentType<PeekProps> =>
  dynamic(loader, { ssr: false, loading: () => null });

export const PEEK_REGISTRY: Record<string, ComponentType<PeekProps>> = {
  agent: peek(() => import("./kinds/AgentPeek")),
  file: peek(() => import("./kinds/FilePeek")),
  note: peek(() => import("./kinds/NotePeek")),
  agent_app: peek(() => import("./kinds/AgentAppPeek")),
  skill: peek(() => import("./kinds/SkillPeek")),
  workflow: peek(() => import("./kinds/WorkflowPeek")),
  content_template: peek(() => import("./kinds/ContentTemplatePeek")),
  conversation: peek(() => import("./kinds/ConversationPeek")),
  flashcard: peek(() => import("./kinds/FlashcardPeek")),
  canvas: peek(() => import("./kinds/CanvasPeek")),
  task: peek(() => import("./kinds/TaskPeek")),
  dataset: peek(() => import("./kinds/DatasetPeek")),
  transcript: peek(() => import("./kinds/TranscriptPeek")),
  agent_shortcut: peek(() => import("./kinds/ShortcutPeek")),
  picklist: peek(() => import("./kinds/ListPeek")),
  workbook: peek(() => import("./kinds/WorkbookPeek")),
  quiz: peek(() => import("./kinds/QuizPeek")),
  sandbox: peek(() => import("./kinds/SandboxPeek")),
  project: peek(() => import("./kinds/ProjectPeek")),
  // Add new kinds here as their peek components land.
};

export function hasPeek(key: string): boolean {
  return key in PEEK_REGISTRY;
}
