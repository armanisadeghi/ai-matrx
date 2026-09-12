"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  FolderOpen,
  GitBranch,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectActiveSandboxId,
  selectExplorerRootOverride,
  selectActiveRepositoryRoot,
  setActiveRepositoryRoot,
  setExplorerRootOverride,
  revealView,
  selectSandboxRuntimeRevision,
  selectGitCommitDraft,
  setGitCommitDraft,
  setRightOpen,
} from "../../redux/codeWorkspaceSlice";
import { openTab } from "../../redux/tabsSlice";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { useOpenFile } from "../../hooks/useOpenFile";
import { codeWorkspaceSurfaceKey } from "../../chat/begin-fresh-code-chat";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { SidePanelAction, SidePanelHeader } from "../SidePanelChrome";
import { HOVER_ROW, ROW_HEIGHT } from "../../styles/tokens";
import {
  SandboxGitAdapter,
  type GitStatusResponse,
} from "../../adapters/SandboxGitAdapter";
import { RepositoryStashes } from "./RepositoryStashes";
import { CredentialsModal } from "./CredentialsModal";
import { CloneRepoDialog } from "../sandboxes/CloneRepoDialog";
import {
  discoverRepositories,
  inspectRepository,
  initRepository,
  unstageRepositoryPaths,
  executeRepositoryGit,
  pushRepository,
  type RepositoryMetadata,
} from "./repositoryService";
import {
  buildRepositoryContextSnapshot,
  GIT_REPOSITORY_CONTEXT_KEY,
} from "./gitContext";

const GIT_CONTEXT_ATTACHMENT_LIMITS = {
  maxDiffCharacters: 120_000,
  maxUntrackedFileCharacters: 32_000,
  maxUntrackedTotalCharacters: 120_000,
} as const;

export function SourceControlPanel({ className }: { className?: string }) {
  const sandboxId = useAppSelector(selectActiveSandboxId);
  const dispatch = useAppDispatch();
  if (!sandboxId)
    return (
      <div className={cn("p-4 text-sm", className)}>
        <p>Connect a sandbox to work with Git repositories.</p>
        <Button
          className="mt-3"
          onClick={() => dispatch(revealView("sandboxes"))}
        >
          Choose sandbox
        </Button>
      </div>
    );
  return (
    <RepositoryPanel
      key={sandboxId}
      sandboxId={sandboxId}
      className={className}
    />
  );
}

function RepositoryPanel({
  sandboxId,
  className,
}: {
  sandboxId: string;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const { filesystem, process } = useCodeWorkspace();
  const store = useAppStore();
  const alive = useRef(true);
  const refreshQueued = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrentSandbox = () =>
    alive.current && selectActiveSandboxId(store.getState()) === sandboxId;
  const openFile = useOpenFile();
  const agentId = searchParams.get("agentId");
  const conversationIdFromUrl = searchParams.get("conversationId");
  const focusedConversationId = useAppSelector(
    agentId
      ? selectFocusedConversation(codeWorkspaceSurfaceKey(agentId))
      : () => null,
  );
  const conversationId = focusedConversationId ?? conversationIdFromUrl;
  const explorerRoot = useAppSelector(selectExplorerRootOverride);
  const repoRoot = useAppSelector(selectActiveRepositoryRoot);
  const runtimeRevision = useAppSelector((state) =>
    selectSandboxRuntimeRevision(state, sandboxId),
  );
  const [adapter] = useState(
    () => new SandboxGitAdapter({ instanceId: sandboxId }),
  );
  const [repo, setRepo] = useState<RepositoryMetadata | null>(null);
  const [repositories, setRepositories] = useState<RepositoryMetadata[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [path, setPath] = useState(
    explorerRoot || filesystem.rootPath || "/home/agent",
  );
  const [showCredentials, setShowCredentials] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [showBranch, setShowBranch] = useState(false);
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [savedAction, setSavedAction] = useState<{
    branch: string;
    action: "restore" | "delete";
  } | null>(null);
  const [autoStashes, setAutoStashes] = useState<AutoStashEntry[]>([]);
  const [collapsed, setCollapsed] = useState({
    staged: false,
    unstaged: false,
    untracked: false,
    autoStash: false,
  });
  const generation = useRef(0);
  const operation = useRef(false);
  const cwd = repo?.rootPath;
  const selectedRemote =
    repo?.remotes.find((remote) => remote.name === remoteName)?.name ||
    repo?.remotes[0]?.name;
  const commitDraftRepositoryRoot = cwd ?? repoRoot;
  const commitMessage = useAppSelector((state) =>
    selectGitCommitDraft(state, sandboxId, commitDraftRepositoryRoot),
  );
  const setCommitMessage = (draft: string) => {
    if (!commitDraftRepositoryRoot) return;
    dispatch(
      setGitCommitDraft({
        sandboxId,
        repositoryRoot: commitDraftRepositoryRoot,
        draft,
      }),
    );
  };

  async function readRepository(root: string, ticket: number) {
    const metadata = await inspectRepository(process, root);
    if (ticket !== generation.current) return;
    if (!metadata) {
      setRepo(null);
      setStatus(null);
      setAutoStashes([]);
      return;
    }
    const next = await adapter.status({ cwd: metadata.rootPath });
    const saved = await executeRepositoryGit(process, metadata.rootPath, [
      "for-each-ref",
      "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)",
      "refs/heads/matrx/auto-stash/",
    ]);
    if (ticket !== generation.current) return;
    setRepo(metadata);
    setStatus(next);
    setRefreshVersion((version) => version + 1);
    setAutoStashes(
      saved.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [branch, shortSha, date] = line.split("|");
          return { branch, shortSha, date };
        }),
    );
    if (!selectActiveRepositoryRoot(store.getState()))
      dispatch(setActiveRepositoryRoot(metadata.rootPath));
  }

  async function refresh(scan = false) {
    if (operation.current) {
      refreshQueued.current = true;
      return;
    }
    const ticket = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      await readRepository(
        selectActiveRepositoryRoot(store.getState()) ||
          explorerRoot ||
          filesystem.rootPath ||
          "/home/agent",
        ticket,
      );
      if (ticket === generation.current) setLoading(false);
      if (scan) {
        const found = await discoverRepositories(
          process,
          filesystem.rootPath || "/home/agent",
          {},
        );
        if (ticket === generation.current) setRepositories(found);
      }
    } catch (cause) {
      if (ticket === generation.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to inspect repository.",
        );
        setStatus(null);
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    setRepo(null);
    setStatus(null);
    setAutoStashes([]);
    setNotice(null);
    if (filesystem.id !== `sandbox:${sandboxId}` || !process.isReady) return;
    void refresh(repositories.length === 0);
    return () => {
      generation.current++;
    };
    // Repository choice is independent of browsing Explorer folders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRoot, process, filesystem.id, sandboxId, runtimeRevision]);

  async function run(action: () => Promise<void>, success?: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const ticket = generation.current;
    try {
      await action();
      if (ticket !== generation.current) return;
      const refreshRoot = selectActiveRepositoryRoot(store.getState()) || cwd;
      if (refreshRoot) await readRepository(refreshRoot, ticket);
      if (success) setNotice(success);
    } catch (cause) {
      if (ticket === generation.current) {
        let message =
          cause instanceof Error ? cause.message : "Git operation failed.";
        // A failed composite operation can still change the index or HEAD.
        // Re-read before reporting the failure so retry actions use current Git state.
        if (cwd) {
          try {
            await readRepository(cwd, ticket);
          } catch (refreshError) {
            message += ` Status could not be refreshed: ${refreshError instanceof Error ? refreshError.message : "try Refresh again"}`;
          }
        }
        if (ticket !== generation.current) return;
        setError(message);
        toast.error(message);
      }
    } finally {
      operation.current = false;
      if (alive.current) {
        setBusy(false);
        if (refreshQueued.current) {
          refreshQueued.current = false;
          void refresh(true);
        }
      }
    }
  }

  async function chooseRepository(root: string) {
    await run(async () => {
      const found = await inspectRepository(process, root);
      if (!found)
        throw new Error(
          "This folder is not inside a Git repository. Choose another folder or initialize it.",
        );
      if (!isCurrentSandbox()) return;
      dispatch(setActiveRepositoryRoot(found.rootPath));
      setShowOpen(false);
    });
  }
  function revealRepository() {
    if (cwd) {
      dispatch(setExplorerRootOverride(cwd));
      dispatch(revealView("explorer"));
    }
  }
  async function commit(pushAfter = false) {
    if (
      !cwd ||
      !status ||
      busy ||
      !commitMessage.trim() ||
      status.staged.length === 0 ||
      status.conflicted.length > 0
    )
      return;
    const message = commitMessage.trim();
    await run(
      async () => {
        await adapter.commit({ cwd, message });
        setCommitMessage("");
        if (pushAfter) {
          if (
            !isCurrentSandbox() ||
            selectActiveRepositoryRoot(store.getState()) !== cwd
          )
            throw new Error(
              "Committed successfully. Push was not started because the active repository changed.",
            );
          if (!selectedRemote || !repo?.branch)
            throw new Error(
              "Committed successfully. Choose a remote and a local branch before pushing.",
            );
          await pushRepository(process, cwd, selectedRemote, repo.branch, {
            setUpstream: !repo.upstream,
          });
        }
      },
      pushAfter
        ? "Committed and pushed."
        : "Committed. Your changes are saved in this repository.",
    );
  }
  async function openDiff(path: string, staged: boolean, untracked = false) {
    if (!cwd) return;
    await run(async () => {
      if (untracked) {
        await openFile(`${cwd}/${path}`);
        return;
      }
      const diff = await adapter.diff({ cwd, path, staged });
      const id = `git-diff:${sandboxId}:${cwd}:${staged ? "staged" : "working"}:${path}`;
      const text = diff.text || "No changes in this comparison.";
      dispatch(
        openTab({
          id,
          path: `git-diff://${cwd}/${path}`,
          name: `${path.split("/").pop()} · ${staged ? "staged" : "working"}`,
          language: "diff",
          content: text,
          pristineContent: text,
          dirty: false,
          readOnly: true,
        }),
      );
    });
  }
  async function attachRepositoryToChat() {
    if (operation.current) return;
    if (!agentId) {
      dispatch(setRightOpen(true));
      setError(
        "Choose an agent in the Code chat before attaching repository context.",
      );
      return;
    }
    if (!conversationId) {
      dispatch(setRightOpen(true));
      setError(
        "The Code chat is still opening. Wait for its conversation, then attach the repository.",
      );
      return;
    }
    if (!cwd) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const [latestRepository, latestStatus, stagedDiff, unstagedDiff] =
        await Promise.all([
          inspectRepository(process, cwd),
          adapter.status({ cwd }),
          adapter.diff({ cwd, staged: true }),
          adapter.diff({ cwd, staged: false }),
        ]);
      if (!latestRepository) {
        throw new Error("The selected folder is no longer a Git repository.");
      }
      const untrackedFiles = await Promise.all(
        latestStatus.untracked.map(async (path) => {
          try {
            return {
              path,
              content: await filesystem.readFile(`${cwd}/${path}`),
            };
          } catch {
            return {
              path,
              error: "Unable to read untracked file",
            };
          }
        }),
      );
      const snapshot = buildRepositoryContextSnapshot({
        repository: latestRepository,
        status: latestStatus,
        stagedDiff: stagedDiff.text,
        unstagedDiff: unstagedDiff.text,
        untrackedFiles,
        limits: GIT_CONTEXT_ATTACHMENT_LIMITS,
      });
      dispatch(
        setContextEntries({
          conversationId,
          entries: [
            {
              key: GIT_REPOSITORY_CONTEXT_KEY,
              value: snapshot,
              type: "json",
              label: `Repository snapshot: ${latestRepository.branch ?? "detached HEAD"}`,
            },
          ],
        }),
      );
      dispatch(setRightOpen(true));
      setNotice(
        snapshot.omissions.length
          ? `Repository context attached with ${snapshot.omissions.length} documented omission${snapshot.omissions.length === 1 ? "" : "s"}.`
          : "Repository context attached to the current Code chat.",
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unable to attach repository context.";
      setError(message);
      toast.error(message);
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const disabled = busy || loading;
  const stage = (paths: string[]) => {
    if (cwd)
      void run(async () => {
        await adapter.add({ cwd, paths });
      });
  };
  const sections = status
    ? [
        {
          key: "staged" as const,
          title: "Staged changes",
          entries: status.staged,
        },
        {
          key: "unstaged" as const,
          title: "Changes",
          entries: status.unstaged,
        },
        {
          key: "untracked" as const,
          title: "Untracked files",
          entries: status.untracked.map((path) => ({ path, status: "??" })),
        },
      ]
    : [];

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Source Control"
        actions={
          <>
            <SidePanelAction
              icon={KeyRound}
              label="Manage GitHub connection and credentials"
              onClick={() => setShowCredentials(true)}
            />
            <SidePanelAction
              icon={RefreshCw}
              label="Refresh repositories and changes"
              onClick={() => {
                if (!disabled) void refresh(true);
              }}
            />
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2 border-b p-3">
          <label
            className="block text-xs font-medium"
            htmlFor="code-git-repository"
          >
            Repository in this sandbox
          </label>
          <select
            id="code-git-repository"
            aria-label="Repository"
            className="h-9 w-full min-w-0 rounded border bg-background px-2 text-xs"
            value={repoRoot || ""}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) void chooseRepository(e.target.value);
            }}
          >
            <option value="">Choose a repository…</option>
            {[
              ...new Set([
                ...(repoRoot ? [repoRoot] : []),
                ...repositories.map((item) => item.rootPath),
              ]),
            ].map((root) => (
              <option key={root} value={root}>
                {root}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setShowOpen(!showOpen)}
            >
              <FolderOpen className="mr-1 h-3.5 w-3.5" />
              Open folder
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setShowClone(true)}
            >
              <GitBranch className="mr-1 h-3.5 w-3.5" />
              Clone
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Discovery shows up to 24 repositories within four folder levels.
            Open a path directly for other projects.
          </p>
          {(showOpen || (!repo && !loading)) && (
            <div className="space-y-2">
              <label
                htmlFor="code-repository-path"
                className="text-xs text-muted-foreground"
              >
                Repository folder
              </label>
              <Input
                id="code-repository-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/agent/my-project"
                disabled={disabled}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  disabled={disabled || !path.trim()}
                  onClick={() => void chooseRepository(path.trim())}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || !path.trim()}
                  onClick={() =>
                    void run(async () => {
                      const created = await initRepository(
                        process,
                        path.trim(),
                        filesystem.rootPath,
                      );
                      if (!isCurrentSandbox()) return;
                      dispatch(setActiveRepositoryRoot(created.rootPath));
                      dispatch(setExplorerRootOverride(created.rootPath));
                      setShowOpen(false);
                    })
                  }
                >
                  Initialize repository
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Initialize adds Git tracking to this folder. It does not stage,
                commit, or publish files.
              </p>
            </div>
          )}
          {repo && (
            <>
              <button
                type="button"
                title="Show repository files in Explorer"
                onClick={revealRepository}
                className="block w-full truncate text-left font-mono text-[11px] text-primary hover:underline"
              >
                {repo.rootPath}
              </button>
              <button
                type="button"
                className="flex max-w-full items-center gap-1 text-xs"
                onClick={() => setShowBranch(!showBranch)}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="truncate">
                  {repo.branch || "Detached HEAD"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {showBranch && (
                <div className="space-y-2">
                  <Input
                    aria-label="Branch name"
                    placeholder="New or existing branch"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || !newBranch.trim()}
                      onClick={() =>
                        void run(async () => {
                          await executeRepositoryGit(process, repo.rootPath, [
                            "check-ref-format",
                            "--branch",
                            newBranch.trim(),
                          ]);
                          await executeRepositoryGit(process, repo.rootPath, [
                            "switch",
                            "-c",
                            newBranch.trim(),
                          ]);
                          setShowBranch(false);
                        })
                      }
                    >
                      Create branch
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || !newBranch.trim()}
                      onClick={() =>
                        void run(async () => {
                          await executeRepositoryGit(process, repo.rootPath, [
                            "check-ref-format",
                            "--branch",
                            newBranch.trim(),
                          ]);
                          await executeRepositoryGit(process, repo.rootPath, [
                            "switch",
                            newBranch.trim(),
                          ]);
                          setShowBranch(false);
                        })
                      }
                    >
                      Switch
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {repo.upstream
                  ? `Tracking ${repo.upstream}`
                  : "No upstream branch"}
                {status?.ahead ? ` · ${status.ahead} ahead` : ""}
                {status?.behind ? ` · ${status.behind} behind` : ""}
              </p>
              <details className="space-y-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Repository settings
                </summary>
                {repo.remotes.map((remote) => (
                  <div key={remote.name} className="break-all text-[11px]">
                    <strong>{remote.name}</strong>
                    <div className="text-muted-foreground">
                      {remote.fetchUrl}
                    </div>
                  </div>
                ))}
                <label className="block text-[11px]" htmlFor="git-remote-name">
                  Remote name
                </label>
                <Input
                  id="git-remote-name"
                  value={remoteName}
                  onChange={(event) => setRemoteName(event.target.value)}
                  placeholder="origin"
                />
                <label className="block text-[11px]" htmlFor="git-remote-url">
                  Add remote URL
                </label>
                <Input
                  id="git-remote-url"
                  value={remoteUrl}
                  onChange={(event) => setRemoteUrl(event.target.value)}
                  placeholder="https://github.com/owner/repository.git"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || !remoteName.trim() || !remoteUrl.trim()}
                  onClick={() =>
                    void run(async () => {
                      if (
                        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remoteName.trim())
                      )
                        throw new Error(
                          "Use letters, numbers, dots, underscores, or hyphens for the remote name.",
                        );
                      if (
                        /^https?:\/\/[^/]*@/i.test(remoteUrl.trim()) ||
                        remoteUrl.trim().startsWith("-")
                      )
                        throw new Error(
                          "Use a remote URL without embedded credentials. Connect GitHub through Credentials.",
                        );
                      await executeRepositoryGit(process, repo.rootPath, [
                        "remote",
                        "add",
                        remoteName.trim(),
                        remoteUrl.trim(),
                      ]);
                      setRemoteUrl("");
                    }, "Remote added.")
                  }
                >
                  Add remote
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Pull and push use{" "}
                  {selectedRemote || "the first remote you add"}. Adding a
                  remote does not publish files.
                </p>
                <label className="block text-[11px]" htmlFor="git-author-name">
                  Commit author name
                </label>
                <Input
                  id="git-author-name"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="Your name"
                />
                <label className="block text-[11px]" htmlFor="git-author-email">
                  Commit author email
                </label>
                <Input
                  id="git-author-email"
                  value={authorEmail}
                  onChange={(event) => setAuthorEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    disabled || !authorName.trim() || !authorEmail.trim()
                  }
                  onClick={() =>
                    void run(async () => {
                      await executeRepositoryGit(process, repo.rootPath, [
                        "config",
                        "--local",
                        "user.name",
                        authorName.trim(),
                      ]);
                      await executeRepositoryGit(process, repo.rootPath, [
                        "config",
                        "--local",
                        "user.email",
                        authorEmail.trim(),
                      ]);
                    }, "Commit identity saved for this repository.")
                  }
                >
                  Save commit identity
                </Button>
              </details>
            </>
          )}
        </div>
        {loading && (
          <div
            role="status"
            className="flex items-center gap-2 p-3 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Inspecting repositories…
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="m-2 break-words rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            {notice}
          </p>
        )}
        {!repo && !loading && !error && (
          <p className="p-3 text-xs text-muted-foreground">
            No repository selected. Open an existing project, clone from GitHub,
            or initialize a project folder.
          </p>
        )}
        {repo && status && (
          <>
            <div className="space-y-2 border-b p-2">
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void attachRepositoryToChat()}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Attach to chat
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || repo.remotes.length === 0}
                  onClick={() =>
                    void run(async () => {
                      await adapter.pull({
                        cwd: repo.rootPath,
                        remote:
                          repo?.remotes.find(
                            (remote) => remote.name === remoteName,
                          )?.name || repo?.remotes[0]?.name,
                        branch: repo.branch || undefined,
                      });
                    }, "Pulled remote changes.")
                  }
                >
                  <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
                  Pull
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || repo.remotes.length === 0}
                  onClick={() =>
                    void run(async () => {
                      if (!selectedRemote || !repo.branch)
                        throw new Error(
                          "Select a remote and a local branch before pushing.",
                        );
                      await pushRepository(
                        process,
                        repo.rootPath,
                        selectedRemote,
                        repo.branch,
                        { setUpstream: !repo.upstream },
                      );
                    }, "Pushed commits.")
                  }
                >
                  <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />
                  Push
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    disabled ||
                    (!status.unstaged.length && !status.untracked.length)
                  }
                  onClick={() => stage(["."])}
                >
                  Stage all
                </Button>
              </div>
              <ProTextarea
                aria-label="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe these changes"
                autoGrow
                minHeight={60}
                maxHeight={160}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void commit(e.shiftKey);
                  }
                }}
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={
                    disabled ||
                    !status.staged.length ||
                    !!status.conflicted.length ||
                    !commitMessage.trim()
                  }
                  onClick={() => void commit()}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Commit
                  {status.staged.length ? ` (${status.staged.length})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Commit and push"
                  title="Commit and push"
                  disabled={
                    disabled ||
                    !status.staged.length ||
                    !!status.conflicted.length ||
                    !commitMessage.trim() ||
                    !repo.remotes.length
                  }
                  onClick={() => void commit(true)}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {status.conflicted.length > 0 && (
              <Section
                title="Merge conflicts"
                count={status.conflicted.length}
                collapsed={false}
                onToggle={() => {}}
                tone="danger"
              >
                {status.conflicted.map((file) => (
                  <ChangeRow
                    key={file}
                    path={file}
                    status="U"
                    onClickEntry={() =>
                      void openFile(`${repo.rootPath}/${file}`)
                    }
                    onPrimary={() => stage([file])}
                    primaryIcon={Plus}
                    primaryLabel="Stage resolved file"
                    busy={disabled}
                  />
                ))}
              </Section>
            )}
            {sections.map(
              (section) =>
                section.entries.length > 0 && (
                  <Section
                    key={section.key}
                    title={section.title}
                    count={section.entries.length}
                    collapsed={collapsed[section.key]}
                    onToggle={() =>
                      setCollapsed((previous) => ({
                        ...previous,
                        [section.key]: !previous[section.key],
                      }))
                    }
                  >
                    {section.entries.map((entry) => (
                      <ChangeRow
                        key={entry.path}
                        path={entry.path}
                        status={entry.status}
                        busy={disabled}
                        onClickEntry={() =>
                          void openDiff(
                            entry.path,
                            section.key === "staged",
                            section.key === "untracked",
                          )
                        }
                        onPrimary={() =>
                          section.key === "staged"
                            ? void run(() =>
                                unstageRepositoryPaths(process, repo.rootPath, [
                                  entry.path,
                                ]),
                              )
                            : stage([entry.path])
                        }
                        primaryIcon={section.key === "staged" ? Minus : Plus}
                        primaryLabel={
                          section.key === "staged"
                            ? `Unstage ${entry.path}`
                            : `Stage ${entry.path}`
                        }
                      />
                    ))}
                  </Section>
                ),
            )}
            {!status.staged.length &&
              !status.unstaged.length &&
              !status.untracked.length &&
              !status.conflicted.length && (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Working tree is clean.
                </p>
              )}
            <RepositoryStashes
              process={process}
              cwd={repo.rootPath}
              disabled={disabled}
              revision={refreshVersion}
              onMutate={run}
            />
            {autoStashes.length > 0 && (
              <Section
                title="Saved session branches"
                count={autoStashes.length}
                collapsed={collapsed.autoStash}
                onToggle={() =>
                  setCollapsed((previous) => ({
                    ...previous,
                    autoStash: !previous.autoStash,
                  }))
                }
              >
                {autoStashes.map((entry) => (
                  <div key={entry.branch} className="border-b px-2 py-1">
                    <button
                      type="button"
                      className="block w-full truncate px-3 py-2 text-left text-xs text-primary"
                      onClick={() =>
                        void run(async () => {
                          const result = await executeRepositoryGit(
                            process,
                            repo.rootPath,
                            ["diff", `HEAD..${entry.branch}`],
                          );
                          dispatch(
                            openTab({
                              id: `auto-stash-diff:${sandboxId}:${repo.rootPath}:${entry.branch}`,
                              path: `auto-stash://${entry.branch}`,
                              name: entry.branch,
                              language: "diff",
                              content: result.stdout,
                              pristineContent: result.stdout,
                              readOnly: true,
                            }),
                          );
                        })
                      }
                    >
                      {entry.branch}
                    </button>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          setSavedAction({
                            branch: entry.branch,
                            action: "restore",
                          })
                        }
                      >
                        Restore files
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() =>
                          setSavedAction({
                            branch: entry.branch,
                            action: "delete",
                          })
                        }
                      >
                        Delete local copy
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="p-2 text-[11px] text-muted-foreground">
                  Review a saved branch before restoring its files. Remote
                  copies are retained when deleting a local copy.
                </p>
              </Section>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!savedAction}
        onOpenChange={(open) => {
          if (!open) setSavedAction(null);
        }}
        title={
          savedAction?.action === "restore"
            ? "Restore saved files?"
            : "Delete saved local branch?"
        }
        description={
          savedAction?.action === "restore"
            ? "This replaces tracked files with the saved session version and stages them for review. Your working tree must be clean. No commit or push is created."
            : "This permanently removes the local saved branch. Its files will not be applied. Any remote copy is retained."
        }
        confirmLabel={
          savedAction?.action === "restore"
            ? "Restore files"
            : "Delete local branch"
        }
        onConfirm={() => {
          const action = savedAction;
          setSavedAction(null);
          if (!action || !cwd) return;
          void run(async () => {
            if (action.action === "restore") {
              const current = await adapter.status({ cwd });
              if (
                current.staged.length ||
                current.unstaged.length ||
                current.untracked.length ||
                current.conflicted.length
              )
                throw new Error(
                  "Commit or stash your current changes before restoring a saved session.",
                );
              await executeRepositoryGit(process, cwd, [
                "restore",
                `--source=${action.branch}`,
                "--staged",
                "--worktree",
                "--",
                ".",
              ]);
            } else
              await executeRepositoryGit(process, cwd, [
                "branch",
                "-D",
                "--",
                action.branch,
              ]);
          });
        }}
      />
      {showCredentials && (
        <CredentialsModal
          adapter={adapter}
          onClose={() => setShowCredentials(false)}
        />
      )}
      {showClone && (
        <CloneRepoDialog
          workspaceRoot={filesystem.rootPath}
          instanceId={sandboxId}
          open={showClone}
          onOpenChange={setShowClone}
          onCloned={(root) => {
            if (!isCurrentSandbox()) return;
            dispatch(setActiveRepositoryRoot(root));
            dispatch(setExplorerRootOverride(root));
          }}
        />
      )}
    </div>
  );
}

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

interface ChangeRowProps {
  path: string;
  status: string;
  onClickEntry: () => void;
  onPrimary: () => void;
  primaryIcon: React.ComponentType<{ size?: number }>;
  primaryLabel: string;
  busy?: boolean;
}

const ChangeRow: React.FC<ChangeRowProps> = ({
  path,
  status,
  onClickEntry,
  onPrimary,
  primaryIcon: PrimaryIcon,
  primaryLabel,
  busy,
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
      disabled={busy}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 opacity-100 transition-opacity hover:bg-neutral-200 hover:text-neutral-900 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
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
