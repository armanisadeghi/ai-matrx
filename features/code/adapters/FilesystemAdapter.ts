import type {
  FilesystemNode,
  FilesystemSearchHit,
  FilesystemStat,
  FilesystemWatchEvent,
} from "../types";
import type { FilesystemSizeSummary } from "../utils/filesystem-properties";

/**
 * Adapter interface for all filesystem sources.
 *
 * Implementations:
 *  - MockFilesystemAdapter — static in-memory project for demos/tests.
 *  - SandboxFilesystemAdapter — talks to /api/sandbox/[id]/fs/* (proxies the
 *    rich orchestrator filesystem API; binary-safe, atomic writes, watcher).
 *
 * The adapter is the single boundary between the workspace UI and whatever
 * storage/runtime is backing it. Keep it narrow; prefer separate adapter
 * methods over plumbing conditionals through the UI.
 *
 * Methods marked optional may be unimplemented by simpler adapters (Mock).
 * UI code should feature-detect (`if (adapter.stat)`).
 */
export interface FilesystemAdapter {
  /** Stable identifier — prefixed to file ids so they survive adapter swaps. */
  readonly id: string;
  /** Human-readable label shown in breadcrumbs, status bar, sandbox picker. */
  readonly label: string;
  /** POSIX path used as the initial "workspace root" in the explorer. */
  readonly rootPath: string;
  /** Whether the adapter currently supports writes. */
  readonly writable: boolean;

  listChildren(path: string): Promise<FilesystemNode[]>;
  readFile(path: string): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;

  /** Optional — single-file stat. */
  stat?(path: string): Promise<FilesystemStat>;
  /**
   * Optional — recursive disk usage for a directory. Sandboxes prefer `du`;
   * simpler adapters may walk `listChildren`.
   */
  computeSize?(
    path: string,
    opts?: { signal?: AbortSignal },
  ): Promise<FilesystemSizeSummary>;
  /** Optional — read a binary file as base64. */
  readFileBinary?(path: string): Promise<string>;
  /** Optional — write base64-encoded binary content. */
  writeFileBinary?(path: string, base64: string): Promise<void>;
  /** Optional — make a directory (mkdir -p when `parents` is true). */
  mkdir?(path: string, parents?: boolean): Promise<void>;
  /** Optional — delete a file or directory. */
  delete?(path: string, recursive?: boolean): Promise<void>;
  /** Optional — atomic rename. */
  rename?(fromPath: string, toPath: string, overwrite?: boolean): Promise<void>;
  /** Optional — copy a file or directory. */
  copy?(fromPath: string, toPath: string, recursive?: boolean): Promise<void>;

  /**
   * Optional subscription. Adapters without a live backend can omit this; the
   * workspace will fall back to explicit refresh actions.
   */
  watch?(path: string, cb: (ev: FilesystemWatchEvent) => void): () => void;

  /** Optional — server-side content search (ripgrep). Streams matches via cb. */
  searchContent?(opts: {
    query: string;
    regex?: boolean;
    caseSensitive?: boolean;
    includeGlobs?: string[];
    excludeGlobs?: string[];
    maxResults?: number;
    onHit: (hit: FilesystemSearchHit) => void;
    signal?: AbortSignal;
  }): Promise<{ truncated: boolean }>;

  /** Optional — server-side path search (fd). */
  searchPaths?(opts: {
    pattern: string;
    fuzzy?: boolean;
    maxResults?: number;
  }): Promise<string[]>;

  /**
   * Optional — upload a Blob (e.g. from a drag-and-drop event) to the given
   * path. Adapters that don't support binary uploads can omit this and the
   * UI will fall back to a base64 readFileBinary write.
   */
  upload?(path: string, blob: Blob): Promise<void>;

  /**
   * Optional — download a file as a Blob. Used by the file tree's
   * "download" context-menu action.
   */
  download?(path: string): Promise<Blob>;

  /**
   * Optional — read multiple files in a single round-trip. Used by the agent
   * context bridge to assemble editor.tabs payloads without fan-out latency.
   */
  batchRead?(paths: string[]): Promise<Record<string, string>>;
}
