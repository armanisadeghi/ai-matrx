/**
 * Resource Types and Interfaces
 *
 * This file defines the structure for all resource types that can be attached to prompts.
 * Resources are converted to XML format when sent to the LLM and parsed back for display.
 */

import type { MessageMetadata } from "./core";

// ===========================
// Base Resource Interfaces
// ===========================

/**
 * Base interface for all resources
 */
export interface BaseResourceData {
  id: string;
  [key: string]: any;
}

/**
 * Note resource data structure
 */
export interface NoteResourceData {
  id: string;
  label: string;
  content: string;
  folder_name?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Task resource data structure
 */
export interface TaskResourceData {
  id: string;
  title: string;
  description?: string;
  status: "incomplete" | "complete" | "in_progress" | string;
  priority?: string;
  due_date?: string;
  project_id?: string;
  project_name?: string;
  subtasks?: any[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Project resource data structure
 */
export interface ProjectResourceData {
  id: string;
  name: string;
  description?: string;
  tasks?: any[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Table resource data structure
 */
export interface TableResourceData {
  // Reference information
  type: "full_table" | "table_row" | "table_column" | "table_cell";
  table_id: string;
  table_name: string;
  description?: string;

  // Additional data based on type
  row_id?: string;
  column_name?: string;
  column_display_name?: string;

  // Full table data (populated when fetched)
  fields?: TableField[];
  rows?: TableRow[];
  row_count?: number;
}

export interface TableField {
  field_name: string;
  display_name: string;
  field_type: string;
  is_required?: boolean;
  [key: string]: any;
}

export interface TableRow {
  id: string;
  [key: string]: any;
}

/**
 * File resource data structure (uploaded or from storage)
 */
export interface FileResourceData {
  // File identification
  id?: string;
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
    icon?: any;
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
export interface WebpageResourceData {
  url: string;
  title?: string;
  textContent?: string;
  charCount?: number;
  scrapedAt?: string;
}

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
  duration?: number;
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
  | { type: "agent"; data: AgentResourceData }
  | { type: "agent_app"; data: AgentAppResourceData }
  | { type: "transcript"; data: TranscriptResourceData }
  | { type: "transcript_session"; data: TranscriptSessionResourceData }
  | { type: "workbook"; data: WorkbookResourceData }
  | { type: "document"; data: DocumentResourceData };

// ===========================
// Resource Formatting Config
// ===========================

/**
 * Configuration for how to format each resource type
 */
export interface ResourceFormatConfig {
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
  extractMetadata: (data: any) => Record<string, string>;

  /**
   * Function to extract content for XML
   */
  extractContent: (data: any) => string;

  /**
   * Whether this resource requires data fetching before formatting
   */
  requiresDataFetch?: boolean;
}

// ===========================
// Message Metadata
// ===========================

// Re-export metadata types from core for convenience
export type {
  MessageFileReference,
  MessageResourceReference,
  MessageMetadata,
} from "./core";

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
