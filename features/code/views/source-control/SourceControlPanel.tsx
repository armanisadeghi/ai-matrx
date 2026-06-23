"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  GitBranch,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveSandboxId } from "../../redux/codeWorkspaceSlice";
import { openTab } from "../../redux/tabsSlice";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { SidePanelAction, SidePanelHeader } from "../SidePanelChrome";
import { HOVER_ROW, ROW_HEIGHT } from "../../styles/tokens";
import {
  SandboxGitAdapter,
  type GitFileChange,
  type GitStatusResponse,
} from "../../adapters/SandboxGitAdapter";
import { CredentialsModal } from "./CredentialsModal";

interface SourceControlPanelProps {
  className?: string;
}

export const SourceControlPanel: React.FC<SourceControlPanelProps> = ({
  className,
}) => {
  const dispatch = useAppDispatch();
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const { filesystem } = useCodeWorkspace();

  const cwd = filesystem.rootPath || "/home/agent";
  const adapter = useMemo(
    () =>
      activeSandboxId
        ? new SandboxGitAdapter({ instanceId: activeSandboxId })
        : null,
    [activeSandboxId],
  );

  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [collapsed, setCollapsed] = useState({
    staged: false,
    unstaged: false,
    untracked: false,
    autoStash: false,
  });
  /**
   * Auto-stash branches written by the matrx_agent persistence module on
   * graceful shutdown (Phase 3 of the persistence plan). Each entry is a
   * `matrx/auto-stash/<ts>` branch containing the dirty + untracked work
   * the previous sandbox closed with.
   */
  const [autoStashes, setAutoStashes] = useState<AutoStashEntry[]>([]);

  // ── Refresh ─────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!adapter) {
      setStatus(null);
      setError(
        "No sandbox connected — Source Control needs an active sandbox.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await adapter.status({ cwd });
      setStatus(next);
    } catch (err) {
      setError(extractErrorMessage(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [adapter, cwd]);

  // ── Auto-stash discovery ────────────────────────────────────────────────
  const refreshAutoStashes = useCallback(async () => {
    if (!activeSandboxId) {
      setAutoStashes([]);
      return;
    }
    const found = await listAutoStashBranches(activeSandboxId, cwd);
    setAutoStashes(found);
  }, [activeSandboxId, cwd]);

  useEffect(() => {
    void refresh();
    void refreshAutoStashes();
  }, [refresh, refreshAutoStashes]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const wrap = useCallback(
    async (action: () => Promise<unknown>, busyMessage?: string) => {
      if (!adapter) return;
      setBusy(true);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (err) {
        setError(
          (busyMessage ? `${busyMessage}: ` : "") + extractErrorMessage(err),
        );
      } finally {
        setBusy(false);
      }
    },
    [adapter, refresh],
  );

  const stage = useCallback(
    (paths: string[]) => wrap(() => adapter!.add({ cwd, paths }), "stage"),
    [adapter, cwd, wrap],
  );
  const stageAll = useCallback(() => stage(["."]), [stage]);
  const unstage = useCallback(
    (path: string) =>
      wrap(
        () => adapter!.add({ cwd, paths: [`:!${path}`] }), // negative pathspec = unstage
        "unstage",
      ),
    [adapter, cwd, wrap],
  );

  const commit = useCallback(async () => {
    const msg = commitMessage.trim();
    if (!msg) {
      setError("Enter a commit message first.");
      return;
    }
    if (!adapter) return;
    await wrap(async () => {
      await adapter.commit({ cwd, message: msg });
      setCommitMessage("");
    }, "commit");
  }, [adapter, cwd, commitMessage, wrap]);

  const push = useCallback(
    () => wrap(() => adapter!.push({ cwd }), "push"),
    [adapter, cwd, wrap],
  );
  const pull = useCallback(
    () => wrap(() => adapter!.pull({ cwd }), "pull"),
    [adapter, cwd, wrap],
  );
  const commitAndPush = useCallback(async () => {
    await commit();
    if (!error) await push();
  }, [commit, push, error]);

  // ── Auto-stash actions ──────────────────────────────────────────────────
  const applyAutoStash = useCallback(
    async (entry: AutoStashEntry) => {
      if (!activeSandboxId) return;
      await wrap(async () => {
        // `git checkout <branch> -- .` overlays files from the branch onto
        // the working tree without creating a merge commit. The user then
        // reviews via the existing Staged/Unstaged sections and commits when
        // ready. Predictable and conflict-free for the common case.
        const r = await execInSandbox(
          activeSandboxId,
          `git checkout ${quote(entry.branch)} -- .`,
          cwd,
        );
        if (r.exit_code !== 0) {
          throw new Error(r.stderr || `git checkout exit ${r.exit_code}`);
        }
      }, "apply auto-stash");
    },
    [activeSandboxId, cwd, wrap],
  );

  const viewAutoStashDiff = useCallback(
    async (entry: AutoStashEntry) => {
      if (!activeSandboxId) return;
      try {
        const r = await execInSandbox(
          activeSandboxId,
          `git diff HEAD..${quote(entry.branch)}`,
          cwd,
        );
        const text = r.stdout || "(no diff)";
        const tabId = `auto-stash-diff:${activeSandboxId}:${entry.branch}`;
        dispatch(
          openTab({
            id: tabId,
            path: `auto-stash://${entry.branch}`,
            name: `Δ ${entry.branch.replace(/^matrx\/auto-stash\//, "")}`,
            language: "diff",
            content: text,
            pristineContent: text,
            dirty: false,
          }),
        );
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    },
    [activeSandboxId, cwd, dispatch],
  );

  const discardAutoStash = useCallback(
    async (entry: AutoStashEntry) => {
      if (!activeSandboxId) return;
      await wrap(async () => {
        // Local delete (always); push delete is best-effort because the
        // remote branch may not exist (auto-stash only pushes when creds
        // were configured at shutdown).
        const r = await execInSandbox(
          activeSandboxId,
          `git branch -D ${quote(entry.branch)}; git push origin :${quote(entry.branch)} 2>/dev/null || true`,
          cwd,
        );
        if (r.exit_code !== 0 && /not found|no such ref/i.test(r.stderr)) {
          // Already gone — treat as success.
          return;
        }
        if (r.exit_code !== 0) {
          throw new Error(r.stderr || `branch -D exit ${r.exit_code}`);
        }
        await refreshAutoStashes();
      }, "discard auto-stash");
    },
    [activeSandboxId, cwd, refreshAutoStashes, wrap],
  );

  // ── Diff preview ────────────────────────────────────────────────────────
  const openDiff = useCallback(
    async (path: string, staged: boolean) => {
      if (!adapter) return;
      try {
        const diff = await adapter.diff({ cwd, path, staged });
        const tabId = `git-diff:${activeSandboxId}:${staged ? "staged" : "working"}:${path}`;
        const text = diff.text || "(no diff)";
        dispatch(
          openTab({
            id: tabId,
            path: `git-diff://${path}${staged ? "?staged" : ""}`,
            name: `Δ ${path.split("/").pop() ?? path}`,
            language: "diff",
            content: text,
            pristineContent: text,
            dirty: false,
          }),
        );
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    },
    [adapter, cwd, activeSandboxId, dispatch],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;
  const conflictCount = status?.conflicted.length ?? 0;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Source Control"
        subtitle={
          status
            ? `${status.branch}${status.ahead ? ` ↑${status.ahead}` : ""}${
                status.behind ? ` ↓${status.behind}` : ""
              }`
            : undefined
        }
        actions={
          <>
            <SidePanelAction
              icon={KeyRound}
              label="Manage credentials"
              onClick={() => setShowCredentials(true)}
            />
            <SidePanelAction
              icon={ArrowDownToLine}
              label="Pull"
              onClick={() => void pull()}
            />
            <SidePanelAction
              icon={ArrowUpFromLine}
              label="Push"
              onClick={() => void push()}
            />
            <SidePanelAction
              icon={Plus}
              label="Stage all"
              onClick={() => void stageAll()}
            />
            <SidePanelAction
              icon={loading ? Loader2 : RefreshCw}
              label="Refresh"
              onClick={() => void refresh()}
            />
          </>
        }
      />
      <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
        <ProTextarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message (⌘+Enter to commit, ⌘+⇧+Enter to commit & push)"
          autoGrow
          minHeight={48}
          maxHeight={160}
          onKeyDown={(e) => {
            // Keyboard commit shortcuts live here (the panel's own buttons stay
            // the primary action, so no duplicate ProTextarea submit button).
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) void commitAndPush();
              else void commit();
            }
          }}
          className="p-1.5 text-[12px]"
        />
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            onClick={() => void commit()}
            disabled={busy || stagedCount === 0 || !commitMessage.trim()}
            className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-blue-400 bg-blue-500 px-2 py-1 text-[11px] text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            Commit{stagedCount > 0 ? ` (${stagedCount})` : ""}
          </button>
          <button
            type="button"
            onClick={() => void commitAndPush()}
            disabled={busy || stagedCount === 0 || !commitMessage.trim()}
            className="flex items-center justify-center gap-1 rounded-sm border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            title="Commit & push"
          >
            <ArrowUpFromLine size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-2 mt-2 flex items-start gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <CircleAlert size={12} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}
        {status &&
          status.staged.length === 0 &&
          status.unstaged.length === 0 &&
          status.untracked.length === 0 &&
          status.conflicted.length === 0 &&
          autoStashes.length === 0 &&
          !error && (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-neutral-500 dark:text-neutral-400">
              <GitBranch size={28} strokeWidth={1.2} />
              <p className="text-xs">Working tree is clean.</p>
            </div>
          )}
        {autoStashes.length > 0 && (
          <Section
            title="Auto-saved from previous session"
            count={autoStashes.length}
            collapsed={collapsed.autoStash}
            onToggle={() =>
              setCollapsed((prev) => ({
                ...prev,
                autoStash: !prev.autoStash,
              }))
            }
            tone="info"
          >
            <div className="px-2 pb-1 text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
              Found {autoStashes.length} auto-saved stash branch
              {autoStashes.length === 1 ? "" : "es"}. Apply overlays the saved
              files onto your current working tree — no merge commit. Discard
              deletes the branch (and its remote copy if any).
            </div>
            {autoStashes.map((entry) => (
              <AutoStashRow
                key={entry.branch}
                entry={entry}
                busy={busy}
                onApply={() => void applyAutoStash(entry)}
                onView={() => void viewAutoStashDiff(entry)}
                onDiscard={() => void discardAutoStash(entry)}
              />
            ))}
          </Section>
        )}
        {conflictCount > 0 && (
          <Section
            title="Merge Conflicts"
            count={conflictCount}
            collapsed={false}
            onToggle={() => {}}
            tone="danger"
          >
            {status!.conflicted.map((path) => (
              <ChangeRow
                key={`c:${path}`}
                path={path}
                status="U"
                onClickEntry={() => void openDiff(path, false)}
                onPrimary={() => stage([path])}
                primaryIcon={Plus}
                primaryLabel="Stage"
              />
            ))}
          </Section>
        )}
        {stagedCount > 0 && (
          <Section
            title="Staged Changes"
            count={stagedCount}
            collapsed={collapsed.staged}
            onToggle={() =>
              setCollapsed((prev) => ({ ...prev, staged: !prev.staged }))
            }
          >
            {status!.staged.map((entry: GitFileChange) => (
              <ChangeRow
                key={`s:${entry.path}`}
                path={entry.path}
                status={entry.status}
                onClickEntry={() => void openDiff(entry.path, true)}
                onPrimary={() => unstage(entry.path)}
                primaryIcon={Minus}
                primaryLabel="Unstage"
              />
            ))}
          </Section>
        )}
        {unstagedCount > 0 && (
          <Section
            title="Changes"
            count={unstagedCount}
            collapsed={collapsed.unstaged}
            onToggle={() =>
              setCollapsed((prev) => ({ ...prev, unstaged: !prev.unstaged }))
            }
          >
            {status!.unstaged.map((entry: GitFileChange) => (
              <ChangeRow
                key={`u:${entry.path}`}
                path={entry.path}
                status={entry.status}
                onClickEntry={() => void openDiff(entry.path, false)}
                onPrimary={() => stage([entry.path])}
                primaryIcon={Plus}
                primaryLabel="Stage"
              />
            ))}
          </Section>
        )}
        {untrackedCount > 0 && (
          <Section
            title="Untracked"
            count={untrackedCount}
            collapsed={collapsed.untracked}
            onToggle={() =>
              setCollapsed((prev) => ({ ...prev, untracked: !prev.untracked }))
            }
          >
            {status!.untracked.map((path: string) => (
              <ChangeRow
                key={`?:${path}`}
                path={path}
                status="??"
                onClickEntry={() => void openDiff(path, false)}
                onPrimary={() => stage([path])}
                primaryIcon={Plus}
                primaryLabel="Stage"
              />
            ))}
          </Section>
        )}
      </div>
      {showCredentials && adapter && (
        <CredentialsModal
          adapter={adapter}
          onClose={() => setShowCredentials(false)}
        />
      )}
    </div>
  );
};

interface SectionProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  tone?: "default" | "danger" | "info";
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  count,
  collapsed,
  onToggle,
  tone = "default",
  children,
}) => (
  <div className="pb-2">
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "sticky top-0 z-[1] flex w-full items-center gap-1 bg-white px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide dark:bg-neutral-950",
        tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : tone === "info"
            ? "text-blue-600 dark:text-blue-400"
            : "text-neutral-500 dark:text-neutral-400",
      )}
    >
      {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
      <span className="flex-1">{title}</span>
      <span>{count}</span>
    </button>
    {!collapsed && children}
  </div>
);

interface AutoStashEntry {
  branch: string;
  /** Author/committer date in ISO-8601 (or whatever the orchestrator gave us). */
  date: string;
  /** Short SHA of the branch's tip. */
  shortSha: string;
}

interface AutoStashRowProps {
  entry: AutoStashEntry;
  busy: boolean;
  onApply: () => void;
  onView: () => void;
  onDiscard: () => void;
}

const AutoStashRow: React.FC<AutoStashRowProps> = ({
  entry,
  busy,
  onApply,
  onView,
  onDiscard,
}) => {
  const label = entry.branch.replace(/^matrx\/auto-stash\//, "");
  return (
    <div
      className={cn(
        "group flex items-center gap-1 px-2 text-[12px]",
        ROW_HEIGHT,
        HOVER_ROW,
      )}
    >
      <Archive size={12} className="shrink-0 text-blue-500" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[11px]">{label}</span>
        {entry.date && (
          <span className="truncate text-[9px] text-neutral-500 dark:text-neutral-400">
            {entry.shortSha} · {formatStashDate(entry.date)}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label="View diff"
        title="View diff vs HEAD"
        onClick={onView}
        disabled={busy}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <Eye size={12} />
      </button>
      <button
        type="button"
        aria-label="Apply auto-stash"
        title="Apply (overlay files onto working tree)"
        onClick={onApply}
        disabled={busy}
        className="flex h-5 shrink-0 items-center gap-0.5 rounded-sm border border-blue-400 bg-blue-500 px-1.5 text-[10px] text-white hover:bg-blue-600 disabled:opacity-50"
      >
        <Plus size={11} />
        Apply
      </button>
      <button
        type="button"
        aria-label="Discard auto-stash"
        title="Delete this auto-stash branch"
        onClick={onDiscard}
        disabled={busy}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

function formatStashDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  if (diffH < 24 * 7) return `${Math.round(diffH / 24)}d ago`;
  return d.toLocaleDateString();
}

/**
 * Discover `matrx/auto-stash/*` branches in the active repo. Uses the
 * sandbox's exec endpoint directly because the daemon's structured `branch`
 * action only handles create/delete/switch — there's no "list with metadata"
 * primitive yet. Errors are swallowed (treated as "no stashes").
 */
async function listAutoStashBranches(
  instanceId: string,
  cwd: string,
): Promise<AutoStashEntry[]> {
  try {
    const r = await execInSandbox(
      instanceId,
      `git for-each-ref --format='%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)' refs/heads/matrx/auto-stash/`,
      cwd,
    );
    if (r.exit_code !== 0) return [];
    return r.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [branch, shortSha, date] = line.split("|");
        return { branch, shortSha, date };
      })
      .filter((e) => e.branch && e.branch.startsWith("matrx/auto-stash/"))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  } catch {
    return [];
  }
}

interface RawExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

async function execInSandbox(
  instanceId: string,
  command: string,
  cwd: string,
): Promise<RawExecResult> {
  const resp = await fetch(`/api/sandbox/${instanceId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, cwd, timeout: 30 }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`exec failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as RawExecResult;
}

/** POSIX-shell-safe single-quoting. */
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

interface ChangeRowProps {
  path: string;
  status: string;
  onClickEntry: () => void;
  onPrimary: () => void;
  primaryIcon: React.ComponentType<{ size?: number }>;
  primaryLabel: string;
}

const ChangeRow: React.FC<ChangeRowProps> = ({
  path,
  status,
  onClickEntry,
  onPrimary,
  primaryIcon: PrimaryIcon,
  primaryLabel,
}) => (
  <div
    className={cn(
      "group flex items-center gap-1 px-2 text-[12px]",
      ROW_HEIGHT,
      HOVER_ROW,
    )}
  >
    <button
      type="button"
      onClick={onClickEntry}
      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
    >
      <StatusBadge status={status} />
      <span className="truncate">{path}</span>
    </button>
    <button
      type="button"
      aria-label={primaryLabel}
      title={primaryLabel}
      onClick={onPrimary}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-900 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <PrimaryIcon size={12} />
    </button>
  </div>
);

function StatusBadge({ status }: { status: string }) {
  const code = status.trim().slice(0, 1) || status.slice(0, 2);
  const map: Record<string, { label: string; color: string }> = {
    M: { label: "M", color: "text-amber-500" },
    A: { label: "A", color: "text-green-600" },
    D: { label: "D", color: "text-red-500" },
    R: { label: "R", color: "text-blue-500" },
    C: { label: "C", color: "text-blue-500" },
    U: { label: "U", color: "text-purple-500" },
    "?": { label: "U", color: "text-emerald-500" },
    "??": { label: "U", color: "text-emerald-500" },
  };
  const entry = map[code] ??
    map[status] ?? {
      label: status.slice(0, 1) || "?",
      color: "text-neutral-400",
    };
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold",
        entry.color,
      )}
    >
      {entry.label}
    </span>
  );
}
