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

import type { ComponentType } from "react";
import AgentPeek from "./kinds/AgentPeek";
import FilePeek from "./kinds/FilePeek";
import NotePeek from "./kinds/NotePeek";
import AgentAppPeek from "./kinds/AgentAppPeek";
import SkillPeek from "./kinds/SkillPeek";
import WorkflowPeek from "./kinds/WorkflowPeek";
import MessageTemplatePeek from "./kinds/MessageTemplatePeek";
import ConversationPeek from "./kinds/ConversationPeek";
import FlashcardPeek from "./kinds/FlashcardPeek";
import CanvasPeek from "./kinds/CanvasPeek";
import TaskPeek from "./kinds/TaskPeek";
import DatasetPeek from "./kinds/DatasetPeek";
import TranscriptPeek from "./kinds/TranscriptPeek";
import ShortcutPeek from "./kinds/ShortcutPeek";
import ListPeek from "./kinds/ListPeek";
import WorkbookPeek from "./kinds/WorkbookPeek";
import QuizPeek from "./kinds/QuizPeek";
import SandboxPeek from "./kinds/SandboxPeek";
import ProjectPeek from "./kinds/ProjectPeek";
import type { PeekProps } from "./types";

export const PEEK_REGISTRY: Record<
  string,
  ComponentType<PeekProps>
> = {
  agent: AgentPeek,
  file: FilePeek,
  note: NotePeek,
  agent_app: AgentAppPeek,
  skill: SkillPeek,
  workflow: WorkflowPeek,
  message_template: MessageTemplatePeek,
  conversation: ConversationPeek,
  flashcard: FlashcardPeek,
  canvas: CanvasPeek,
  task: TaskPeek,
  dataset: DatasetPeek,
  transcript: TranscriptPeek,
  agent_shortcut: ShortcutPeek,
  picklist: ListPeek,
  workbook: WorkbookPeek,
  quiz: QuizPeek,
  sandbox: SandboxPeek,
  project: ProjectPeek,
  // Add new kinds here as their peek components land.
};

export function hasPeek(key: string): boolean {
  return key in PEEK_REGISTRY;
}
