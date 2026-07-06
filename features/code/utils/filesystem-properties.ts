import type { FilesystemAdapter } from "../adapters/FilesystemAdapter";
import type { FilesystemNode, FilesystemStat } from "../types";

export interface FilesystemSizeSummary {
  bytes: number;
  fileCount: number;
  dirCount: number;
  /** True when the walk hit a safety cap or du failed and we used a partial estimate. */
  estimated?: boolean;
}

export interface FilesystemProperties {
  path: string;
  name: string;
  kind: FilesystemNode["kind"] | "symlink";
  sizeBytes: number | null;
  modifiedAt?: string;
  mode?: number;
  permissions?: string;
  symlinkTarget?: string;
  /** Immediate children — directories only. */
  childCount?: number;
  /** Recursive totals — populated after an explicit size calculation. */
  totalSize?: FilesystemSizeSummary;
}

function quoteShellPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

export function formatUnixMode(mode: number): string {
  const type =
    (mode & 0o170000) === 0o040000
      ? "d"
      : (mode & 0o170000) === 0o120000
        ? "l"
        : "-";
  const perm = mode & 0o777;
  let out = type;
  for (let group = 0; group < 3; group += 1) {
    const triplet = (perm >> (6 - group * 3)) & 0o7;
    out += triplet & 4 ? "r" : "-";
    out += triplet & 2 ? "w" : "-";
    out += triplet & 1 ? "x" : "-";
  }
  return `${out} (${perm.toString(8)})`;
}

export function statToProperties(
  stat: FilesystemStat,
  node: FilesystemNode,
): FilesystemProperties {
  return {
    path: stat.path,
    name: node.name,
    kind: stat.kind === "symlink" ? "symlink" : stat.kind,
    sizeBytes: stat.kind === "directory" ? null : stat.size,
    modifiedAt: stat.modifiedAt ?? node.modifiedAt,
    mode: stat.mode,
    permissions: stat.mode != null ? formatUnixMode(stat.mode) : undefined,
    symlinkTarget: stat.target,
  };
}

export function nodeToProperties(node: FilesystemNode): FilesystemProperties {
  return {
    path: node.path,
    name: node.name,
    kind: node.kind,
    sizeBytes: node.kind === "file" ? (node.size ?? null) : null,
    modifiedAt: node.modifiedAt,
  };
}

export async function fetchFilesystemProperties(
  adapter: FilesystemAdapter,
  node: FilesystemNode,
): Promise<FilesystemProperties> {
  let props = nodeToProperties(node);

  if (adapter.stat) {
    try {
      props = statToProperties(await adapter.stat(node.path), node);
    } catch {
      // Keep list-derived metadata when stat is unavailable.
    }
  }

  if (node.kind === "directory") {
    try {
      const children = await adapter.listChildren(node.path);
      props.childCount = children.length;
    } catch {
      // Non-fatal — dialog still shows path / modified.
    }
  }

  return props;
}

export async function computeDirectorySizeViaList(
  adapter: FilesystemAdapter,
  path: string,
  opts?: { signal?: AbortSignal; maxNodes?: number },
): Promise<FilesystemSizeSummary> {
  const maxNodes = opts?.maxNodes ?? 10_000;
  let bytes = 0;
  let fileCount = 0;
  let dirCount = 0;
  let visited = 0;
  let estimated = false;

  const walk = async (dirPath: string): Promise<void> => {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const entries = await adapter.listChildren(dirPath);
    for (const entry of entries) {
      if (opts?.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      visited += 1;
      if (visited > maxNodes) {
        estimated = true;
        return;
      }
      if (entry.kind === "directory") {
        dirCount += 1;
        await walk(entry.path);
        if (estimated) return;
      } else {
        fileCount += 1;
        bytes += entry.size ?? 0;
      }
    }
  };

  await walk(path);
  return { bytes, fileCount, dirCount, estimated };
}

export async function computeDirectorySize(
  adapter: FilesystemAdapter,
  path: string,
  opts?: { signal?: AbortSignal },
): Promise<FilesystemSizeSummary> {
  if (adapter.computeSize) {
    return adapter.computeSize(path, opts);
  }
  return computeDirectorySizeViaList(adapter, path, opts);
}

/** Fast total bytes via `du -sb` inside a sandbox container. */
export async function computeDirectorySizeViaDu(
  instanceId: string,
  path: string,
  opts?: { signal?: AbortSignal; timeoutSec?: number },
): Promise<FilesystemSizeSummary | null> {
  const quoted = quoteShellPath(path);
  const resp = await fetch(
    `/api/sandbox/${encodeURIComponent(instanceId)}/exec`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: `du -sb ${quoted} 2>/dev/null | awk '{print $1}'`,
        timeout: opts?.timeoutSec ?? 120,
      }),
      signal: opts?.signal,
    },
  );
  if (!resp.ok) return null;

  const data = (await resp.json()) as { stdout?: string; exit_code?: number };
  const bytes = Number.parseInt((data.stdout ?? "").trim(), 10);
  if (!Number.isFinite(bytes) || bytes < 0) return null;

  return { bytes, fileCount: 0, dirCount: 0, estimated: false };
}
