"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronRight,
  FilePlus,
  FolderPlus,
  Home,
  Pencil,
  Plug,
  RefreshCw,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useCloudTree } from "@/features/files/hooks/useCloudTree";
import {
  selectActiveSandboxId,
  selectExplorerRootOverride,
  setActiveView,
  setExplorerRootOverride,
} from "../../redux/codeWorkspaceSlice";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { SidePanelHeader, SidePanelAction } from "../SidePanelChrome";
import { CloudFilesExplorer } from "./CloudFilesExplorer";
import { FileTree } from "./FileTree";
import { PendingChangesSection } from "./PendingChangesSection";
import { EditHistorySection } from "./EditHistorySection";

interface ExplorerPanelProps {
  className?: string;
}

/**
 * Single Explorer panel that swaps its body based on what the workspace is
 * pointed at.
 *
 *   • No sandbox connected → the user's actual cloud files
 *     (`cld_files` / `cld_folders`) — images, videos, PDFs, datasets,
 *     code, anything they've uploaded. Reuses the same FileTree
 *     component as `/files` so previews, drag-and-drop, and
 *     keyboard nav all "just work". Path bar / quick-roots are hidden
 *     because cloud files don't live on a unix-style path tree.
 *   • Sandbox connected     → the sandbox's filesystem rendered as a
 *     classic VSCode-style file tree, with a path bar + quick-roots for
 *     fast navigation around the container.
 *
 * In both modes the header shows a sandbox-status button that jumps to the
 * Sandboxes view, so users can pick / disconnect a sandbox without leaving
 * the Explorer mental model. The user's saved code (`code_files`) remains
 * one click away via the Library activity icon.
 */
export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const { filesystem } = useCodeWorkspace();
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const userId = useAppSelector((state) => state.userAuth?.id ?? null);
  const override = useAppSelector(selectExplorerRootOverride);
  const rootPath = override ?? filesystem.rootPath;
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftPath, setDraftPath] = useState(rootPath);
  const [createRequest, setCreateRequest] = useState<{
    id: number;
    kind: "file" | "directory";
  } | null>(null);
  const { refresh: refreshCloudTree } = useCloudTree(userId);

  // A sandbox is "connected" when the workspace has been pointed at one
  // *and* the active filesystem adapter isn't the default Mock fallback.
  // Using both checks keeps us honest if the adapter swaps out of band.
  const sandboxConnected = Boolean(activeSandboxId) && filesystem.id !== "mock";
  const showFileTree = sandboxConnected;

  const segments = useMemo(() => pathSegments(rootPath), [rootPath]);

  const navigate = useCallback(
    (path: string) => {
      const normalized = normalize(path);
      dispatch(
        setExplorerRootOverride(
          normalized === filesystem.rootPath ? null : normalized,
        ),
      );
    },
    [dispatch, filesystem.rootPath],
  );

  const goUp = useCallback(() => {
    if (rootPath === "/") return;
    navigate(rootPath.replace(/\/[^/]+\/?$/, "") || "/");
  }, [rootPath, navigate]);

  const commitDraft = useCallback(() => {
    navigate(draftPath || "/");
    setEditing(false);
  }, [draftPath, navigate]);

  const refresh = useCallback(() => {
    if (showFileTree) {
      // Sandbox FS — bump the watcher key, the FileTree will refetch.
      setRefreshKey((k) => k + 1);
    } else {
      // Cloud files — re-hydrate the tree from the API. The realtime
      // channel keeps us live, but explicit refresh is the user's
      // escape hatch when something gets wedged. No-op when unauth.
      refreshCloudTree();
    }
  }, [refreshCloudTree, showFileTree]);

  const openSandboxes = useCallback(() => {
    dispatch(setActiveView("sandboxes"));
  }, [dispatch]);

  // The connected sandbox is already named in the workspace shell. Keeping
  // only the cloud-mode label leaves the compact header room for its controls.
  const subtitle = sandboxConnected ? undefined : "Your cloud files";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Explorer"
        subtitle={subtitle}
        actions={
          <>
            {sandboxConnected ? (
              <SidePanelAction
                icon={Plug}
                label={`Sandbox: ${filesystem.label} — manage`}
                onClick={openSandboxes}
                active
              />
            ) : (
              <SidePanelAction
                icon={Server}
                label="Connect a sandbox"
                onClick={openSandboxes}
              />
            )}
            {sandboxConnected && (
              <>
                <SidePanelAction
                  icon={FilePlus}
                  label="New file in this folder"
                  onClick={() =>
                    setCreateRequest((previous) => ({
                      id: (previous?.id ?? 0) + 1,
                      kind: "file",
                    }))
                  }
                />
                <SidePanelAction
                  icon={FolderPlus}
                  label="New folder in this folder"
                  onClick={() =>
                    setCreateRequest((previous) => ({
                      id: (previous?.id ?? 0) + 1,
                      kind: "directory",
                    }))
                  }
                />
              </>
            )}
            <SidePanelAction
              icon={RefreshCw}
              label="Refresh Explorer"
              onClick={refresh}
            />
          </>
        }
      />

      {/* Auto-hides when no patches are staged. Sits above both the
          sandbox file tree and the cloud-files explorer so the user has
          one consistent place to find AI edits regardless of which
          filesystem the workspace is pointed at. */}
      <PendingChangesSection />

      {/* Persistent timeline of every assistant message that has
          touched a file in the active conversation. Auto-hides when
          there's no history yet. */}
      <EditHistorySection />

      {showFileTree ? (
        <>
          {/* Path bar ─────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-1 border-b border-neutral-200 px-2 py-1 text-[11px] dark:border-neutral-800">
            <button
              type="button"
              title="Go to adapter root"
              onClick={() => navigate(filesystem.rootPath)}
              className="flex h-5 w-5 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <Home size={10} />
            </button>
            {editing ? (
              <input
                autoFocus
                value={draftPath}
                onChange={(e) => setDraftPath(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDraft();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraftPath(rootPath);
                  }
                }}
                className="h-5 flex-1 rounded-sm border border-blue-500 bg-white px-1 font-mono text-[11px] outline-none dark:bg-neutral-900"
              />
            ) : (
              <>
                <BreadcrumbRow segments={segments} onJump={navigate} />
                <button
                  type="button"
                  onClick={() => {
                    setDraftPath(rootPath);
                    setEditing(true);
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                  title="Edit location"
                  aria-label="Edit location"
                >
                  <Pencil size={10} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={goUp}
              disabled={rootPath === "/"}
              title="Go up"
              className="flex h-5 items-center rounded-sm px-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              ..
            </button>
          </div>

          <FileTree refreshKey={refreshKey} createRequest={createRequest} />
        </>
      ) : (
        <CloudFilesExplorer className="min-h-0 flex-1" />
      )}
    </div>
  );
};

function BreadcrumbRow({
  segments,
  onJump,
}: {
  segments: { name: string; path: string }[];
  onJump: (path: string) => void;
}) {
  if (segments.length === 0) {
    return <span className="min-w-0 flex-1 text-neutral-500">/</span>;
  }
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden font-mono text-neutral-600 dark:text-neutral-400">
      <button
        type="button"
        className="shrink-0 hover:text-blue-600"
        onClick={() => onJump("/")}
        aria-label="Go to filesystem root"
      >
        /
      </button>
      {segments.map((s, i) => (
        <React.Fragment key={s.path}>
          <ChevronRight
            size={10}
            className="mx-[1px] shrink-0 text-neutral-400"
          />
          <button
            type="button"
            className={cn(
              "min-w-0 truncate",
              i === segments.length - 1
                ? "font-medium text-neutral-900 dark:text-neutral-100"
                : "hover:text-blue-600",
            )}
            onClick={() => onJump(s.path)}
            aria-current={i === segments.length - 1 ? "page" : undefined}
          >
            {s.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function normalize(p: string): string {
  if (!p) return "/";
  const collapsed = p.replace(/\/+/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/$/, "");
}

function pathSegments(path: string): { name: string; path: string }[] {
  const normalized = normalize(path);
  if (normalized === "/") return [];
  const parts = normalized.split("/").filter(Boolean);
  return parts.map((name, i) => ({
    name,
    path: "/" + parts.slice(0, i + 1).join("/"),
  }));
}
