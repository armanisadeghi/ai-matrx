"use client";

/**
 * Canvas kinds that show "something about the current item" — a record, a
 * source document, one engine's answer, a record's comment threads, a person's journey, a directive's
 * shape, a map topic, the suggestion inbox — and a page's own live panel. Each feature owns its kind beside its
 * code; this is only where they register, at boot, so a remembered tab renders
 * on the first paint after hydration. Every kind here is light: its body loads
 * only when one of its tabs renders.
 */

import { registerCanvasKinds, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { RECORD_PEEK_CANVAS_KIND } from "@/features/window-panels/detail/canvas/recordPeekKind";
import { AI_ANSWER_CANVAS_KIND } from "@/features/marketing/seo/ai-visibility/canvas/aiAnswerKind";
import { SOURCE_PREVIEW_CANVAS_KIND } from "@/features/kg-suggestions/components/source-preview/sourcePreviewKind";
import { USER_JOURNEY_CANVAS_KIND } from "@/features/admin/users/canvas/userJourneyKind";
import { DIRECTIVE_SHAPE_CANVAS_KIND } from "@/features/directive-catalog/canvas/directiveShapeKind";
import { TOPICAL_MAP_TOPIC_CANVAS_KIND } from "@/features/marketing/seo/topical-map/canvas/topicKind";
import { KG_SUGGESTIONS_CANVAS_KIND } from "@/features/kg-suggestions/canvas/kgSuggestionsKind";
import {
  DOCUMENT_HISTORY_CANVAS_KIND,
  WORKBOOK_HISTORY_CANVAS_KIND,
} from "@/lib/univer/historyKinds";
import { KNOWLEDGE_ASSETS_CANVAS_KIND } from "@/features/rag/canvas/knowledgeAssetsKind";
import { SYSTEM_CONTEXT_PREVIEW_CANVAS_KIND } from "@/features/admin/system-context/canvas/systemContextPreviewKind";
import { AGENT_EDIT_HISTORY_CANVAS_KIND } from "./agent/agentEditHistoryKind";
import { NOTE_HISTORY_CANVAS_KIND } from "@/features/notes/canvas/noteHistoryKind";
import { CLOUD_FILE_EDITOR_CANVAS_KIND } from "@/features/files/canvas/cloudFileEditorKind";
import { AGENT_PAYLOAD_CANVAS_KIND } from "@/features/marketing/content-plan/canvas/agentPayloadKind";
import { WAR_ROOM_RESOURCES_CANVAS_KIND } from "@/features/war-room/canvas/warRoomResourcesKind";
import { COMMENT_THREAD_CANVAS_KIND } from "@/features/rich-document/annotations/canvas/commentThreadKind";
import { GROUP_CHAT_INSPECTOR_CANVAS_KIND } from "@/features/vision-interview/group-chat/canvas/groupChatInspectorKind";
import { PAGE_PANEL_CANVAS_KIND } from "./pagePanel";

export const FEATURE_CANVAS_KINDS: readonly AnyCanvasKind[] = [
  RECORD_PEEK_CANVAS_KIND,
  AI_ANSWER_CANVAS_KIND,
  SOURCE_PREVIEW_CANVAS_KIND,
  USER_JOURNEY_CANVAS_KIND,
  DIRECTIVE_SHAPE_CANVAS_KIND,
  TOPICAL_MAP_TOPIC_CANVAS_KIND,
  KG_SUGGESTIONS_CANVAS_KIND,
  // A document's / a workbook's snapshot history beside its editor.
  DOCUMENT_HISTORY_CANVAS_KIND,
  WORKBOOK_HISTORY_CANVAS_KIND,
  // A document's Knowledge Assets builder beside the source.
  KNOWLEDGE_ASSETS_CANVAS_KIND,
  // What agents receive for global system context (admin console).
  SYSTEM_CONTEXT_PREVIEW_CANVAS_KIND,
  // An agent's in-session undo/redo timeline beside its builder.
  AGENT_EDIT_HISTORY_CANVAS_KIND,
  // A note's version history beside the note.
  NOTE_HISTORY_CANVAS_KIND,
  // A cloud file's text editor beside its preview.
  CLOUD_FILE_EDITOR_CANVAS_KIND,
  // What a content plan's agents are handed ("See what the AI sees").
  AGENT_PAYLOAD_CANVAS_KIND,
  // A war room's / a thread's resources beside the room.
  WAR_ROOM_RESOURCES_CANVAS_KIND,
  // A record's comment threads (the Notes & comments panel), keyed by entity:id.
  COMMENT_THREAD_CANVAS_KIND,
  // A room's Group Chat inspector: who sees what, and what each participant was shown.
  GROUP_CHAT_INSPECTOR_CANVAS_KIND,
  // A page's own live panel (a table's row detail, an admin form) — see pagePanel.tsx.
  PAGE_PANEL_CANVAS_KIND,
];

export function registerFeatureCanvasKinds(): () => void {
  return registerCanvasKinds(FEATURE_CANVAS_KINDS);
}
