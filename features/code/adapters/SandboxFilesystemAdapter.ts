import type { FilesystemAdapter } from "./FilesystemAdapter";
import type {
  FilesystemNode,
  FilesystemSearchHit,
  FilesystemStat,
  FilesystemWatchEvent,
} from "../types";
import {
  computeDirectorySizeViaDu,
  computeDirectorySizeViaList,
  type FilesystemSizeSummary,
} from "../utils/filesystem-properties";

interface DaemonEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  mode: number;
  target?: string | null;
}

/**
 * Adapter that talks to the orchestrator's structured filesystem API via
 * /api/sandbox/[id]/fs/* (which forwards into the in-container matrx_agent
 * daemon). Binary-safe via base64 encoding, atomic writes, and a real change
 * watcher.
 *
 * The previous shell-based implementation (`ls -lA`/`cat`/`base64 -d`) is
 * gone — it broke for binary files, files larger than ~7.5KB (after base64
 * bloat against the 10K command cap), and any directory listing involving
 * filenames with spaces or non-ASCII characters.
 */
export class SandboxFilesystemAdapter implements FilesystemAdapter {
  readonly id: string;
  readonly label: string;
  readonly rootPath: string;
  readonly writable = true;

  constructor(
    /** sandbox_instances.id (the UUID used by the /api/sandbox/[id] route). */
    public readonly instanceId: string,
    label?: string,
    rootPath: string = "/home/agent",
  ) {
    this.id = `sandbox:${instanceId}`;
    this.label = label ?? "Sandbox";
    this.rootPath = rootPath;
  }

  // ── private HTTP helpers ───────────────────────────────────────────────────

  private url(
    subpath: string,
    query?: Record<string, string | undefined>,
  ): string {
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`,
          )
          .join("&")
      : "";
    return `/api/sandbox/${this.instanceId}/fs/${subpath}${qs}`;
  }

  private async req<T>(
    subpath: string,
    init: RequestInit & { query?: Record<string, string | undefined> } = {},
  ): Promise<T> {
    const { query, ...rest } = init;
    const resp = await fetch(this.url(subpath, query), rest);
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(
        `fs ${rest.method ?? "GET"} ${subpath} failed (${resp.status}): ${text}`,
      );
    }
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return resp.json() as Promise<T>;
    }
    // For binary reads we expect text or raw bytes — caller decodes.
    return (await resp.text()) as unknown as T;
  }

  // ── core methods ───────────────────────────────────────────────────────────

  async listChildren(path: string): Promise<FilesystemNode[]> {
    const data = await this.req<{ entries: DaemonEntry[] }>("list", {
      query: { path },
    });
    const nodes: FilesystemNode[] = (data.entries ?? []).map((e) => ({
      path: e.path,
      name: e.name,
      kind: e.kind === "dir" ? "directory" : "file",
      size: e.kind === "file" ? e.size : undefined,
      modifiedAt: e.mtime ? new Date(e.mtime * 1000).toISOString() : undefined,
    }));
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  async computeSize(
    path: string,
    opts?: { signal?: AbortSignal },
  ): Promise<FilesystemSizeSummary> {
    const viaDu = await computeDirectorySizeViaDu(this.instanceId, path, opts);
    if (viaDu) return viaDu;
    return computeDirectorySizeViaList(this, path, opts);
  }

  async stat(path: string): Promise<FilesystemStat> {
    const e = await this.req<DaemonEntry>("stat", { query: { path } });
    return {
      path: e.path,
      kind:
        e.kind === "dir"
          ? "directory"
          : e.kind === "symlink"
            ? "symlink"
            : "file",
      size: e.size,
      mode: e.mode,
      modifiedAt: e.mtime ? new Date(e.mtime * 1000).toISOString() : undefined,
      target: e.target ?? undefined,
    };
  }

  async readFile(path: string): Promise<string> {
    const resp = await fetch(this.url("read", { path, encoding: "utf8" }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`read failed (${resp.status}): ${text}`);
    }
    return resp.text();
  }

  async readFileBinary(path: string): Promise<string> {
    // The daemon emits base64 when encoding=base64 — but historically
    // it has shipped two response shapes:
    //   • JSON envelope: `{ content: "<base64>", encoding: "base64" }`
    //   • Plain text body: the raw base64 string
    // Tolerate both so a daemon upgrade can't break binary previews.
    // Also strip whitespace / newlines that some encoders insert (PEM
    // / MIME line wrapping) — `window.atob` rejects those even though
    // they're valid base64.
    const resp = await fetch(this.url("read", { path, encoding: "base64" }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`read failed (${resp.status}): ${text}`);
    }
    const ct = resp.headers.get("content-type") || "";
    let raw: string;
    if (ct.includes("application/json")) {
      const data = (await resp.json()) as
        | {
            content?: string;
            encoding?: string;
          }
        | string
        | null;
      if (typeof data === "string") {
        raw = data;
      } else if (data && typeof data.content === "string") {
        raw = data.content;
      } else {
        throw new Error(
          `read failed: unexpected JSON shape for base64 read (${typeof data})`,
        );
      }
    } else {
      raw = await resp.text();
    }
    return raw.replace(/\s+/g, "");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.req("write", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        content,
        encoding: "utf8",
        create_parents: true,
      }),
    });
  }

  async writeFileBinary(path: string, base64: string): Promise<void> {
    await this.req("write", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        content: base64,
        encoding: "base64",
        create_parents: true,
      }),
    });
  }

  async mkdir(path: string, parents: boolean = true): Promise<void> {
    await this.req("mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, parents }),
    });
  }

  async delete(path: string, recursive: boolean = false): Promise<void> {
    await this.req("delete", {
      method: "DELETE",
      query: { path, recursive: recursive ? "true" : "false" },
    });
  }

  async rename(
    fromPath: string,
    toPath: string,
    overwrite: boolean = false,
  ): Promise<void> {
    await this.req("rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, overwrite }),
    });
  }

  async copy(
    fromPath: string,
    toPath: string,
    recursive: boolean = true,
  ): Promise<void> {
    await this.req("copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, recursive }),
    });
  }

  // ── change watcher (WebSocket) ─────────────────────────────────────────────

  watch(path: string, cb: (ev: FilesystemWatchEvent) => void): () => void {
    if (typeof window === "undefined") {
      return () => {};
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/sandbox/${this.instanceId}/fs/watch?path=${encodeURIComponent(path)}&recursive=true`;
    let socket: WebSocket | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(
            typeof event.data === "string" ? event.data : "{}",
          );
          if (msg && msg.type && msg.path) {
            cb({
              type: msg.type,
              path: msg.path,
              fromPath: msg.from_path ?? msg.fromPath,
            });
          }
        } catch {
          // Ignore malformed frames — daemon should only send JSON.
        }
      };
      socket.onclose = () => {
        if (closed) return;
        // Light reconnect backoff — most disconnects are sandbox restarts.
        setTimeout(connect, 1500);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };
    connect();

    return () => {
      closed = true;
      socket?.close();
    };
  }

  // ── search ─────────────────────────────────────────────────────────────────

  async searchContent(opts: {
    query: string;
    regex?: boolean;
    caseSensitive?: boolean;
    includeGlobs?: string[];
    excludeGlobs?: string[];
    maxResults?: number;
    onHit: (hit: FilesystemSearchHit) => void;
    signal?: AbortSignal;
  }): Promise<{ truncated: boolean }> {
    const resp = await fetch(`/api/sandbox/${this.instanceId}/search/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: opts.query,
        regex: opts.regex ?? false,
        case_sensitive: opts.caseSensitive ?? false,
        include_globs: opts.includeGlobs,
        exclude_globs: opts.excludeGlobs,
        max_results: opts.maxResults ?? 1000,
      }),
      signal: opts.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`search/content failed (${resp.status}): ${text}`);
    }
    const data = await resp.json();
    for (const hit of data.matches ?? []) {
      opts.onHit({
        path: hit.path,
        line: hit.line,
        column: hit.column,
        text: (hit.text ?? "").trim(),
      });
    }
    return { truncated: !!data.truncated };
  }

  async searchPaths(opts: {
    pattern: string;
    fuzzy?: boolean;
    maxResults?: number;
  }): Promise<string[]> {
    const resp = await fetch(`/api/sandbox/${this.instanceId}/search/paths`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: opts.pattern,
        fuzzy: opts.fuzzy ?? false,
        max_results: opts.maxResults ?? 200,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`search/paths failed (${resp.status}): ${text}`);
    }
    const data = await resp.json();
    return (data.paths ?? []) as string[];
  }

  // ── bulk fs ────────────────────────────────────────────────────────────────

  async upload(path: string, blob: Blob): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    await this.writeFileBinary(path, base64);
  }

  async download(path: string): Promise<Blob> {
    // Fast path: the daemon exposes `/fs/download` which returns the
    // raw bytes (Content-Type: application/octet-stream or whatever
    // mime it can sniff). This avoids the 33% base64 inflation +
    // `atob` decoding cost for large media (images / video / pdf /
    // archives) and — more importantly — sidesteps the
    // "atob: not correctly encoded" failure when an upstream layer
    // returns plain text instead of the expected JSON envelope.
    const resp = await fetch(this.url("download", { path }));
    if (resp.ok) {
      return await resp.blob();
    }
    // Fallback: older orchestrators / daemons that don't advertise
    // `/fs/download` still answer `/fs/read?encoding=base64`.
    if (resp.status === 404 || resp.status === 405) {
      const base64 = await this.readFileBinary(path);
      const bytes = base64ToUint8Array(base64);
      // Copy into a fresh ArrayBuffer so the resulting Blob doesn't
      // capture a `Uint8Array<ArrayBufferLike>` (which can be a
      // SharedArrayBuffer view) that TypeScript can't narrow back to
      // the strict `BlobPart` union under newer lib.dom.
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return new Blob([buffer]);
    }
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`download failed (${resp.status}): ${text}`);
  }

  async batchRead(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const resp = await fetch(this.url("batch/read"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths, encoding: "utf8" }),
    });
    if (!resp.ok) {
      // Fallback when the orchestrator doesn't expose a batch endpoint:
      // sequential reads. Keeps callers working on older tiers.
      if (resp.status === 404 || resp.status === 405) {
        const out: Record<string, string> = {};
        for (const p of paths) {
          out[p] = await this.readFile(p);
        }
        return out;
      }
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`fs batch/read failed (${resp.status}): ${text}`);
    }
    const data = (await resp.json()) as { files?: Record<string, string> };
    return data.files ?? {};
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof window !== "undefined"
    ? window.btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

function base64ToUint8Array(base64: string): Uint8Array {
  // `window.atob` rejects whitespace even though MIME / PEM base64
  // routinely contains line breaks. Strip first.
  const cleaned = base64.replace(/\s+/g, "");
  const binary =
    typeof window !== "undefined"
      ? window.atob(cleaned)
      : Buffer.from(cleaned, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
