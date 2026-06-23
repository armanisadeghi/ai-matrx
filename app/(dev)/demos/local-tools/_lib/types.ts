// ---------------------------------------------------------------------------
// Shared types for Matrx Local demo pages
// ---------------------------------------------------------------------------

export interface ToolResult {
  id?: string;
  type: "success" | "error";
  output: string;
  image?: { media_type: string; base64_data: string };
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  direction: "sent" | "received";
  tool?: string;
  data: unknown;
}

export interface ConnectionInfo {
  url: string;
  ws: string;
  port: number;
}

// Scrape-specific metadata
export interface ScrapeResultMeta {
  status: "success" | "error";
  url: string;
  status_code?: number;
  content_type?: string;
  from_cache?: boolean;
  cms?: "wordpress" | "shopify" | "unknown";
  firewall?: "cloudflare" | "aws_waf" | "datadome" | "none";
  error?: string;
  overview?: Record<string, unknown>;
  links?: Record<string, unknown>;
  elapsed_ms?: number;
}

export interface BatchScrapeMetadata {
  results: ScrapeResultMeta[];
  total: number;
  success_count: number;
  elapsed_ms: number;
}

export interface SearchResult {
  keyword: string;
  title: string;
  url: string;
  description: string;
  age?: string;
}

export interface SearchMetadata {
  results: SearchResult[];
  total: number;
  elapsed_ms: number;
}

export interface ResearchMetadata {
  query: string;
  pages_scraped: number;
  pages_failed: number;
  elapsed_ms: number;
  content_length: number;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "discovering";

// ---------------------------------------------------------------------------
// Health / Version / Engine
// ---------------------------------------------------------------------------

export interface HealthInfo {
  status: string;
  uptime?: number;
  version?: string;
  [key: string]: unknown;
}

export interface VersionInfo {
  version: string;
  build?: string;
  [key: string]: unknown;
}

export interface PortInfo {
  [key: string]: number | string | unknown;
}

export interface EngineSettings {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Active Request Tracking
// ---------------------------------------------------------------------------

export interface ActiveRequest {
  id: string;
  tool: string;
  startedAt: Date;
}

// ---------------------------------------------------------------------------
// Documents / Notes
// ---------------------------------------------------------------------------

export interface DocFolder {
  id: string;
  name: string;
  parent_id?: string | null;
  children?: DocFolder[];
  created_at?: string;
  updated_at?: string;
}

export interface DocNote {
  id: string;
  title: string;
  content?: string;
  folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
  synced_at?: string;
  [key: string]: unknown;
}

export interface NoteVersion {
  version_id: string;
  note_id: string;
  content: string;
  created_at: string;
  [key: string]: unknown;
}

export interface SyncStatus {
  status: string;
  last_sync?: string;
  pending_changes?: number;
  [key: string]: unknown;
}

export interface DocConflict {
  id: string;
  note_id: string;
  local_content?: string;
  remote_content?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ShareInfo {
  id: string;
  resource_type: "note" | "folder";
  resource_id: string;
  shared_with?: string;
  permissions?: string;
  [key: string]: unknown;
}

export interface DirectoryMapping {
  id: string;
  local_path: string;
  remote_path?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Cloud Sync
// ---------------------------------------------------------------------------

export interface CloudConfig {
  jwt: string;
  user_id: string;
}

export interface CloudSettings {
  [key: string]: unknown;
}

export interface InstanceInfo {
  id?: string;
  name?: string;
  last_seen?: string;
  [key: string]: unknown;
}
