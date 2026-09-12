/**
 * Strict translation between the sandbox daemon's git wire responses and the
 * workspace's stable source-control model. The daemon deliberately returns
 * porcelain text so this is the one place that understands it.
 */

export interface GitFileChange {
  path: string;
  /** Two-column porcelain status, e.g. "M ", " M", "R ", "UU". */
  status: string;
}

export interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
}

export interface GitLogEntry {
  sha: string;
  short: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitDiff {
  path: string | null;
  text: string;
  staged: boolean;
}

type JsonRecord = Record<string, unknown>;

function objectPayload(payload: unknown, operation: string): JsonRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`git ${operation} returned an invalid response`);
  }
  return payload as JsonRecord;
}

function requiredString(
  payload: JsonRecord,
  key: string,
  operation: string,
): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new Error(`git ${operation} returned an invalid response: missing ${key}`);
  }
  return value;
}

function parseBranchHeader(header: string): Pick<GitStatusResponse, "branch" | "ahead" | "behind"> {
  const raw = header.replace(/^##\s*/, "").trim();
  if (!raw) return { branch: "HEAD", ahead: 0, behind: 0 };

  const unborn = raw.match(/^No commits yet on (.+)$/);
  if (unborn) return { branch: unborn[1], ahead: 0, behind: 0 };
  if (raw === "HEAD (no branch)" || raw.startsWith("HEAD (detached")) {
    return { branch: "HEAD (detached)", ahead: 0, behind: 0 };
  }

  const trackingIndex = raw.indexOf("...");
  const bracketIndex = raw.indexOf(" [");
  const end = [trackingIndex, bracketIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), raw.length);
  const branch = raw.slice(0, end).trim() || "HEAD";
  const ahead = Number(raw.match(/\bahead\s+(\d+)/)?.[1] ?? 0);
  const behind = Number(raw.match(/\bbehind\s+(\d+)/)?.[1] ?? 0);
  return { branch, ahead, behind };
}

function displayPath(path: string): string {
  // Non--z porcelain spells a rename as `old -> new`; Source Control should
  // act on the destination path, which is the working-tree name users see.
  const rename = path.lastIndexOf(" -> ");
  return decodePorcelainPath(rename >= 0 ? path.slice(rename + 4) : path);
}

/** Git quotes paths with whitespace in its non--z porcelain output. */
function decodePorcelainPath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  const escaped = path.slice(1, -1);
  return escaped.replace(
    /\\(?:([\\"abfnrtv])|([0-7]{1,3}))/gu,
    (_match, character: string | undefined, octal: string | undefined) => {
      if (octal) return String.fromCharCode(Number.parseInt(octal, 8));
      const map: Record<string, string> = {
        "\\": "\\",
        '"': '"',
        a: "\u0007",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\u000b",
      };
      return map[character ?? ""] ?? "";
    },
  );
}

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** Parses the daemon's `git status --porcelain -b` response without guessing. */
export function parseDaemonGitStatus(payload: unknown): GitStatusResponse {
  const response = objectPayload(payload, "status");
  const rawOutput = requiredString(response, "raw_output", "status");
  // The daemon emits this duplicate header field today. Require it so a future
  // daemon contract change is loud instead of being silently mis-rendered.
  requiredString(response, "branch", "status");

  const lines = rawOutput.split(/\r?\n/);
  const header = lines.shift() ?? "";
  const result: GitStatusResponse = {
    ...parseBranchHeader(header),
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };

  for (const line of lines) {
    if (!line || line.startsWith("!! ")) continue;
    if (line.startsWith("?? ")) {
      result.untracked.push(decodePorcelainPath(line.slice(3)));
      continue;
    }
    if (line.length < 3 || line[2] !== " ") continue;

    const status = line.slice(0, 2);
    const path = displayPath(line.slice(3));
    if (!path) continue;
    if (CONFLICT_CODES.has(status)) result.conflicted.push(path);
    if (status[0] !== " ") result.staged.push({ path, status });
    if (status[1] !== " ") result.unstaged.push({ path, status });
  }

  return result;
}

export function parseDaemonGitDiff(
  payload: unknown,
  request: { path?: string; staged?: boolean },
): GitDiff {
  const response = objectPayload(payload, "diff");
  return {
    path: request.path ?? null,
    text: requiredString(response, "diff", "diff"),
    staged: Boolean(request.staged),
  };
}

export function parseDaemonGitLog(payload: unknown): GitLogEntry[] {
  const response = objectPayload(payload, "log");
  const logs = response.logs;
  if (!Array.isArray(logs)) {
    throw new Error("git log returned an invalid response: missing logs");
  }
  return logs.map((entry) => {
    const record = objectPayload(entry, "log");
    return {
      sha: requiredString(record, "sha", "log"),
      short: requiredString(record, "short", "log"),
      author: requiredString(record, "author", "log"),
      date: requiredString(record, "date", "log"),
      subject: requiredString(record, "subject", "log"),
    };
  });
}

/**
 * The daemon emits `{ status: "success" }` for `git add`; every other
 * mutation currently includes command output. Keep that deliberate exception
 * here so a future missing output in commit/push/pull/branch/stash/clone fails
 * loudly instead of hiding a wire-contract regression.
 */
export function parseDaemonGitMutation(payload: unknown, operation: string): {
  ok: true;
  output: string;
} {
  const response = objectPayload(payload, operation);
  if (requiredString(response, "status", operation) !== "success") {
    throw new Error(`git ${operation} returned an unsuccessful response`);
  }
  if (operation === "add") return { ok: true, output: "" };
  return { ok: true, output: requiredString(response, "output", operation) };
}

export function resolveSandboxClonePath(
  dest: string,
  workspaceRoot = "/home/agent",
): string {
  const base = dest.startsWith("/") ? dest : `${workspaceRoot}/${dest}`;
  const parts: string[] = [];
  for (const part of base.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/** Keep actionable daemon diagnostics without reflecting embedded credentials. */
export function sanitizeGitErrorDetail(detail: string): string {
  return detail
    .replace(/(https?:\/\/)[^\s/@]+@/giu, "$1[redacted]@")
    .replace(/([?&](?:access_token|token|oauth_token|password)=)[^&\s]*/giu, "$1[redacted]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/gu, "[redacted]");
}
