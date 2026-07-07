/**
 * Resource-type → Lucide icon map for shareable resources.
 *
 * Small presentational lookup used by share surfaces (DM "shared with you"
 * cards, link previews). Keyed by the registry `resourceType` token; falls back
 * to a neutral share glyph for anything unmapped so a new type is never iconless.
 * Lucide only (no emoji) per the UI standards.
 */
import {
  Bot,
  Boxes,
  Braces,
  Building2,
  Code2,
  FileAudio,
  FileText,
  FlaskConical,
  Folder,
  GraduationCap,
  Layers,
  ListChecks,
  MessageSquare,
  Mic,
  Notebook,
  Palette,
  Presentation,
  Search,
  Share2,
  Table,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const RESOURCE_ICONS: Record<string, LucideIcon> = {
  note: Notebook,
  note_folder: Folder,
  agent: Bot,
  agent_card: Bot,
  app: Boxes,
  conversation: MessageSquare,
  dm_conversation: MessageSquare,
  workflow: Workflow,
  wf_run: Workflow,
  wf_trigger: Workflow,
  canvas_item: Palette,
  code_file: Code2,
  code_folder: Folder,
  code_repository: Braces,
  content_template: FileText,
  fc_card: GraduationCap,
  fc_set: GraduationCap,
  flashcard_data: GraduationCap,
  quiz_sessions: ListChecks,
  file: FileText,
  folder: Folder,
  transcript: Mic,
  studio_session: FileAudio,
  project: Layers,
  task: ListChecks,
  thread: MessageSquare,
  war_room: Presentation,
  research_template: FlaskConical,
  research_topic: Search,
  skill: FlaskConical,
  udt_datasets: Table,
  udt_documents: FileText,
  udt_picklists: ListChecks,
  udt_workbooks: Table,
  wc_claim: Building2,
  feature_doc: FileText,
};

/** Icon for a resource type; a neutral share glyph if unmapped. */
export function getResourceIcon(resourceType: string): LucideIcon {
  return RESOURCE_ICONS[resourceType] ?? Share2;
}
