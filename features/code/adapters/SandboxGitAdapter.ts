/**
 * Adapter for git operations against a sandbox.
 *
 * All methods route through /api/sandbox/[id]/git/* which proxies to the
 * orchestrator and from there into the in-container daemon (which shells out
 * to `git`). The point of having a structured adapter — rather than calling
 * `process.exec("git status")` — is that the responses are already parsed
 * JSON, so the source-control UI never has to scrape `git` output.
 *
 * The interface intentionally mirrors the matrx_agent daemon's contract one
 * to one. See `/srv/projects/matrx-sandbox/SANDBOX_CLIENT_GUIDE.md` §8 for
 * the underlying semantics.
 */

import type { SandboxAccessResponse } from "@/types/sandbox";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  parseDaemonGitDiff,
  parseDaemonGitLog,
  parseDaemonGitMutation,
  parseDaemonGitStatus,
  resolveSandboxClonePath,
  sanitizeGitErrorDetail,
  type GitDiff,
  type GitLogEntry,
  type GitStatusResponse,
} from "./SandboxGitWireFormat";

export type {
  GitDiff,
  GitFileChange,
  GitLogEntry,
  GitStatusResponse,
} from "./SandboxGitWireFormat";

// `cwd` is repeated on every call because the daemon scopes git operations to
// a directory inside the sandbox. Defaults to /home/agent.
// Using `{}` as the default lets `status({cwd})` type-check while
// keeping more specific shapes (e.g. `{path?: string}`) intact when
// callers pass them explicitly.
type WithCwd<T = object> = T & { cwd?: string };

export interface GitCloneRequest {
  url: string;
  dest: string;
  branch?: string;
  depth?: number;
  /** Reference into the credential store; opaque to the frontend. */
  credentials_ref?: string;
}

export interface GitCommitRequest {
  message: string;
  author?: { name: string; email: string };
  amend?: boolean;
}

export interface GitBranchAction {
  action: "create" | "delete" | "switch";
  name: string;
}

export interface GitStashAction {
  action: "push" | "pop" | "list" | "drop";
  message?: string;
}

export interface GitAdapterOptions {
  /** sandbox_instances.id (the UUID used by the /api/sandbox/[id] route). */
  instanceId: string;
  /** The daemon's WORKSPACE_ROOT (normally the active sandbox hot path). */
  workspaceRoot?: string;
}

export class SandboxGitAdapter {
  readonly id: string;
  constructor(public readonly opts: GitAdapterOptions) {
    this.id = `sandbox-git:${opts.instanceId}`;
  }

  private captureFailure(path: string, error: unknown, status?: number): void {
    try {
      const message = sanitizeGitErrorDetail(
        error instanceof Error ? error.message : String(error),
      );
      captureError({
        source: "api-http",
        relation: `sandbox git ${path}`,
        code: "sandbox_git_failed",
        message,
        status,
        details: message,
        raw: { path, status },
      });
    } catch {
      // Diagnostics must never make a workspace action fail differently.
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    let status: number | undefined;
    try {
      const resp = await fetch(
        `/api/sandbox/${this.opts.instanceId}/git/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      status = resp.status;
      if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(
          `git ${path} failed (${resp.status}): ${sanitizeGitErrorDetail(txt)}`,
        );
      }
      return await resp.json();
    } catch (error) {
      this.captureFailure(path, error, status);
      throw error;
    }
  }

  private async get(
    path: string,
    query?: Record<string, string | undefined>,
  ): Promise<unknown> {
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`,
          )
          .join("&")
      : "";
    let status: number | undefined;
    try {
      const resp = await fetch(
        `/api/sandbox/${this.opts.instanceId}/git/${path}${qs}`,
      );
      status = resp.status;
      if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(
          `git ${path} failed (${resp.status}): ${sanitizeGitErrorDetail(txt)}`,
        );
      }
      return await resp.json();
    } catch (error) {
      this.captureFailure(path, error, status);
      throw error;
    }
  }

  // ── Repo lifecycle ─────────────────────────────────────────────────────

  async clone(req: GitCloneRequest): Promise<{ ok: true; path: string }> {
    parseDaemonGitMutation(await this.post("clone", req), "clone");
    return {
      ok: true,
      path: resolveSandboxClonePath(req.dest, this.opts.workspaceRoot),
    };
  }

  // ── Read ───────────────────────────────────────────────────────────────

  async status(opts?: WithCwd): Promise<GitStatusResponse> {
    return parseDaemonGitStatus(await this.get("status", { cwd: opts?.cwd }));
  }

  async diff(opts?: WithCwd<{ path?: string; staged?: boolean }>): Promise<GitDiff> {
    return parseDaemonGitDiff(await this.get("diff", {
      cwd: opts?.cwd,
      path: opts?.path,
      staged: opts?.staged ? "true" : undefined,
    }), opts ?? {});
  }

  async log(opts?: WithCwd<{ limit?: number }>): Promise<GitLogEntry[]> {
    return parseDaemonGitLog(await this.get("log", {
      cwd: opts?.cwd,
      limit: opts?.limit ? String(opts.limit) : undefined,
    }));
  }

  // ── Mutate ─────────────────────────────────────────────────────────────

  async add(opts: WithCwd<{ paths: string[] }>): Promise<{ ok: true; output: string }> {
    // The daemon passes `paths` directly to `git add`; `--` prevents a
    // filename beginning with `-` from being interpreted as a git flag.
    return parseDaemonGitMutation(
      await this.post("add", { ...opts, paths: ["--", ...opts.paths] }),
      "add",
    );
  }

  async commit(opts: WithCwd<GitCommitRequest>): Promise<{ ok: true; output: string }> {
    const author = opts.author
      ? `${opts.author.name} <${opts.author.email}>`
      : undefined;
    return parseDaemonGitMutation(
      await this.post("commit", { ...opts, author }),
      "commit",
    );
  }

  push(
    opts: WithCwd<{
      remote?: string;
      branch?: string;
      force_with_lease?: boolean;
    }> = {},
  ): Promise<{ ok: true; output: string }> {
    return this.post("push", opts).then((payload) =>
      parseDaemonGitMutation(payload, "push"),
    );
  }

  pull(
    opts: WithCwd<{ remote?: string; branch?: string; rebase?: boolean }> = {},
  ): Promise<{ ok: true; output: string }> {
    return this.post("pull", opts).then((payload) =>
      parseDaemonGitMutation(payload, "pull"),
    );
  }

  branch(opts: WithCwd<GitBranchAction>): Promise<{ ok: true; output: string }> {
    return this.post("branch", opts).then((payload) =>
      parseDaemonGitMutation(payload, "branch"),
    );
  }

  stash(
    opts: WithCwd<GitStashAction>,
  ): Promise<{ ok: true; output: string }> {
    return this.post("stash", opts).then((payload) =>
      parseDaemonGitMutation(payload, "stash"),
    );
  }

  // ── Credentials ────────────────────────────────────────────────────────
  // Note: credentials are NOT a /git endpoint — they live at
  // /api/sandbox/[id]/credentials. We expose them here so a "Source Control"
  // UI has a single object to reach for.

  setGithubToken(
    token: string,
    scope: "read" | "write" = "write",
  ): Promise<{ ok: boolean }> {
    return this.postCredentials({ kind: "github", token, scope });
  }

  /**
   * Bootstrap git credentials using the server-side workspace token
   * (`MATRX_SANDBOX_GH_TOKEN`). The token never crosses the wire to the
   * browser — the route reads it from process.env and forwards to the
   * orchestrator directly.
   */
  async useWorkspaceToken(
    scope: "read" | "write" = "write",
  ): Promise<{ ok: boolean }> {
    const resp = await fetch(
      `/api/sandbox/${this.opts.instanceId}/credentials/workspace`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      },
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.statusText);
      // 412 = workspace token not configured server-side. Surface the
      // upstream `details` so the UI can prompt the user to set the env var
      // rather than silently dropping back to the manual modal.
      throw new Error(`workspace credentials failed (${resp.status}): ${txt}`);
    }
    return resp.json();
  }

  setSshKey(privateKey: string, knownHosts?: string): Promise<{ ok: boolean }> {
    return this.postCredentials({
      kind: "ssh",
      private_key: privateKey,
      known_hosts: knownHosts,
    });
  }

  revokeCredentials(): Promise<{ ok: boolean }> {
    return fetch(`/api/sandbox/${this.opts.instanceId}/credentials/revoke`, {
      method: "POST",
    }).then((r) => {
      if (!r.ok) throw new Error(`revoke failed (${r.status})`);
      return r.json();
    });
  }

  private async postCredentials<T>(body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(
      `/api/sandbox/${this.opts.instanceId}/credentials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.statusText);
      throw new Error(`credentials failed (${resp.status}): ${txt}`);
    }
    return resp.json();
  }
}

// Re-export the SSH access helper near the git adapter — natural neighbor.
export type { SandboxAccessResponse };
