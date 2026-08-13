/**
 * Resource Types and Interfaces
 *
 * Canonical home for all resource types used by agents, chat, and public-chat.
 * Resources describe file/URL/text attachments for any AI call — they are NOT
 * prompt-specific. Moved here from features/prompts/types/resources.ts so the
 * prompts feature can be deleted without breaking live agent/chat code.
 */

import type { PreFetchedUrl } from "@/types/python-generated/stream-events";
import type { Note } from "@/features/notes/types";
import type { DatabaseTask, ProjectWithTasks } from "@/features/tasks/types";
import type { ComponentType } from "react";
import type { TableBookmark } from "@/features/agents/types/message-types";

// ===========================
// Base Resource Interfaces
// ===========================

/**
 * Base interface for all resources
 */
export interface BaseResourceData {
  id: string;
  [key: string]: unknown;
}

/**
 * Note resource data structure
 */
export type NoteResourceData = Note;

/**
 * Task resource data structure
 */
export type TaskResourceData = DatabaseTask;

/**
 * Project resource data structure
 */
export type ProjectResourceData = ProjectWithTasks;

/**
 * Table resource data structure
 */
export type TableResourceData = TableBookmark & {
  table_name: string;
  description?: string;
  column_display_name?: string;
  fields?: TableField[];
  rows?: TableRow[];
  row_count?: number;
  cell_value?: unknown;
};

export interface TableField {
  field_name: string;
  display_name: string;
  field_type: string;
  is_required?: boolean;
  [key: string]: unknown;
}

export interface TableRow {
  id: string;
  [key: string]: unknown;
}

/**
 * File resource data structure (uploaded or from storage)
 */
export interface FileResourceData {
  // File identification
  id?: string;
  /** Canonical cld_files UUID emitted by upload and storage pickers. */
  fileId?: string;
  filename?: string;
  filepath?: string;
  url?: string;
  type?: string;

  // File metadata
  size?: number;
  mime_type?: string;
  content_type?: string;

  // Display info (for icons, etc.)
  details?: {
    filename: string;
    icon?: ComponentType<{ className?: string }>;
    color?: string;
    extension?: string;
  };

  // Content (if text-based file was read)
  content?: string;

  created_at?: string;
}

/**
 * Webpage (scraped content) resource data structure
 */
export type WebpageResourceData = PreFetchedUrl;

/**
 * YouTube video resource data structure
 * Note: YouTube URLs typically go in settings, not message content
 */
export interface YouTubeResourceData {
  url: string;
  videoId: string;
  title?: string;
  channelName?: string;
  transcript?: string;
  duration?: string;
  publishedAt?: string | null;
}

/**
 * Image URL resource data structure
 * Note: Image URLs typically go in settings, not message content
 */
export interface ImageUrlResourceData {
  url: string;
  type?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/**
 * File URL resource data structure
 * Note: File URLs typically go in settings, not message content
 */
export interface FileUrlResourceData {
  url: string;
  filename?: string;
  extension?: string;
  type?: string;
  mime_type?: string;
}

/**
 * Audio resource data structure
 */
export interface AudioResourceData {
  id?: string;
  filename?: string;
  url?: string;
  duration?: number;
  transcript?: string;
  created_at?: string;
}

/**
 * Plain text captured by an attachment-style picker (for example Voice Pad).
 * It travels as a canonical text message part, not as fake audio with no
 * resolvable media URL or file id.
 */
export interface TextResourceData {
  id: string;
  label: string;
  text: string;
}

/**
 * Agent resource data structure (reference to a saved agent).
 */
export interface AgentResourceData {
  id: string;
  name?: string;
  description?: string;
}

/**
 * Agent App resource data structure (reference to a published agent app).
 */
export interface AgentAppResourceData {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
}

/**
 * Transcript resource data structure (a full transcript record).
 */
export interface TranscriptResourceData {
  id: string;
  title?: string;
}

/**
 * Transcript Session resource data structure (one recording session within a
 * transcript). Distinct wire type from a full transcript.
 */
export interface TranscriptSessionResourceData {
  id: string;
  title?: string;
  transcript_id?: string;
}

/**
 * Workbook resource data structure.
 */
export interface WorkbookResourceData {
  id: string;
  name?: string;
}

/**
 * Document resource data structure (a Matrx rich document — distinct from an
 * uploaded file).
 */
export interface DocumentResourceData {
  id: string;
  title?: string;
}

/**
 * A live context cell reference. `referenceFence` is the canonical Matrx
 * envelope pointer resolved by aidream on every send; it is not a value
 * snapshot.
 */
export interface ContextValueResourceData {
  id: string;
  scope_id: string;
  context_item_id: string;
  label: string;
  scope_name?: string;
  context_item_name?: string;
  referenceFence: string;
}

// ===========================
// Unified Resource Type
// ===========================

/**
 * Union type for all resource types
 */
export type Resource =
  | { type: "note"; data: NoteResourceData }
  | { type: "task"; data: TaskResourceData }
  | { type: "project"; data: ProjectResourceData }
  | { type: "file"; data: FileResourceData }
  | { type: "table"; data: TableResourceData }
  | { type: "webpage"; data: WebpageResourceData }
  | { type: "youtube"; data: YouTubeResourceData }
  | { type: "image_url"; data: ImageUrlResourceData }
  | { type: "file_url"; data: FileUrlResourceData }
  | { type: "audio"; data: AudioResourceData }
  | { type: "text"; data: TextResourceData }
  | { type: "agent"; data: AgentResourceData }
  | { type: "agent_app"; data: AgentAppResourceData }
  | { type: "transcript"; data: TranscriptResourceData }
  | { type: "transcript_session"; data: TranscriptSessionResourceData }
  | { type: "workbook"; data: WorkbookResourceData }
  | { type: "document"; data: DocumentResourceData }
  | { type: "context_value"; data: ContextValueResourceData };

// ===========================
// Resource Formatting Config
// ===========================

/**
 * Configuration for how to format each resource type
 */
export interface ResourceFormatConfig<TData> {
  /**
   * Instructions to include for the AI about this resource type
   */
  instructions: string;

  /**
   * Whether this resource should be included in message content (true)
   * or in settings/attachments (false)
   */
  includeInContent: boolean;

  /**
   * Function to extract metadata for XML tags
   */
  extractMetadata: (data: TData) => Record<string, string>;

  /**
   * Function to extract content for XML
   */
  extractContent: (data: TData) => string;

  /**
   * Whether this resource requires data fetching before formatting
   */
  requiresDataFetch?: boolean;
}

export type ResourceFormatConfigMap = Partial<{
  [TType in Resource["type"]]: ResourceFormatConfig<
    Extract<Resource, { type: TType }>["data"]
  >;
}>;

// ===========================
// Message Metadata (inlined from features/prompts/types/core.ts)
// ===========================

/**
 * File reference for message metadata
 */
export interface MessageFileReference {
  uri: string;
  mime_type?: string;
}

/**
 * Resource reference for message metadata (minimal info for backend)
 */
export interface MessageResourceReference {
  type: string;
  id?: string;
  data?: unknown;
}

/**
 * Message metadata structure - extensible for future additions
 */
export interface MessageMetadata {
  taskId?: string;
  files?: MessageFileReference[];
  resources?: MessageResourceReference[];
  timestamp?: string;
  timeToFirstToken?: number;
  totalTime?: number;
  tokens?: number;
  cost?: number;
  [key: string]: unknown; // Allow additional metadata properties
}

// ===========================
// Processed Resources
// ===========================

/**
 * Result of processing resources for message inclusion
 */
export interface ProcessedResources {
  /**
   * Resources formatted as XML to include in message content
   */
  formattedXml: string;

  /**
   * Resources that should be added to settings (URLs, etc.)
   */
  settingsAttachments: {
    imageUrls?: string[];
    fileUrls?: string[];
    youtubeUrls?: string[];
    audioFiles?: string[];
  };

  /**
   * Metadata to attach to the message (files array, resources array)
   */
  metadata: MessageMetadata;

  /**
   * Original resources for reference
   */
  originalResources: Resource[];
}

/**
 * Parsed resource from message content
 */
export interface ParsedResource {
  type: string;
  id: string;
  metadata: Record<string, string>;
  content: string;
  rawXml: string;
  startIndex: number;
  endIndex: number;
}
