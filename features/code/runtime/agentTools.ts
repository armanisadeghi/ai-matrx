import type { ProcessResult } from "../types";
import { extractErrorMessage } from "@/utils/errors";
import {
  appendLine,
  appendLines,
  setExecuting,
  setActiveTab as setTerminalActiveTab,
  setOpen as setTerminalOpen,
  type TerminalLine,
} from "../redux/terminalSlice";
import { openTab } from "../redux/tabsSlice";
import { languageFromFilename } from "../styles/file-icon";
import { getWorkspace } from "./workspaceRegistry";

/**
 * High-level, call-from-anywhere wrappers that let agent tools — and any
 * other non-React code — drive the active CodeWorkspace. Each function:
 *
 *   1. Resolves the workspace handle via `workspaceRegistry`.
 *   2. Invokes the underlying FilesystemAdapter / ProcessAdapter method.
 *   3. Mirrors the effect into Redux (terminal lines, opened tabs, etc.) so
 *      the user sees exactly what the agent did.
 *
 * All functions accept an optional `workspaceId` (default `"default"`) so
 * multiple simultaneous workspaces can be driven independently.
 */

interface WithWorkspace {
  workspaceId?: string;
}

interface RunShellInput extends WithWorkspace {
  command: string;
  cwd?: string;
  timeoutSec?: number;
  /** Whether to reveal the terminal tab. Default true. */
  reveal?: boolean;
}

/**
 * Run a shell command inside the active workspace's process adapter.
 * Mirrors the command + output into the Redux terminal log tagged as
 * `source: "agent"` so it's visually distinct from user-typed commands.
 */
export async function runShellCommand({
  command,
  cwd,
  timeoutSec,
  workspaceId,
  reveal = true,
}: RunShellInput): Promise<ProcessResult> {
  const ws = getWorkspace(workspaceId);
  if (!ws.process.isReady) {
    throw new Error(
      `[agent-tools] Workspace "${ws.id}" has no ready process adapter`,
    );
  }

  const { dispatch } = ws.store;

  if (reveal) {
    dispatch(setTerminalActiveTab("terminal"));
    dispatch(setTerminalOpen(true));
  }

  dispatch(
    appendLine({
      type: "command",
      text: command,
      tab: "terminal",
      cwd: cwd ?? ws.process.cwd,
      source: "agent",
    }),
  );
  dispatch(setExecuting(true));

  try {
    const result = await ws.process.exec(command, { cwd, timeoutSec });
    const lines: Omit<TerminalLine, "id">[] = [];
    if (result.stdout) {
      lines.push({
        type: "stdout" as const,
        text: result.stdout,
        tab: "terminal" as const,
        source: "agent" as const,
      });
    }
    if (result.stderr) {
      lines.push({
        type: "stderr" as const,
        text: result.stderr,
        tab: "terminal" as const,
        source: "agent" as const,
      });
    }
    lines.push({
      type: "info" as const,
      text: `Exit ${result.exitCode}`,
      exitCode: result.exitCode,
      cwd: result.cwd,
      tab: "terminal" as const,
      source: "agent" as const,
    });
    dispatch(appendLines(lines));
    return result;
  } catch (err) {
    const message = extractErrorMessage(err);
    dispatch(
      appendLine({
        type: "stderr",
        text: message,
        tab: "terminal",
        source: "agent",
      }),
    );
    throw err;
  } finally {
    dispatch(setExecuting(false));
  }
}

interface ReadFileInput extends WithWorkspace {
  path: string;
}

export async function readWorkspaceFile({
  path,
  workspaceId,
}: ReadFileInput): Promise<string> {
  const ws = getWorkspace(workspaceId);
  return ws.filesystem.readFile(path);
}

interface WriteFileInput extends WithWorkspace {
  path: string;
  content: string;
}

export async function writeWorkspaceFile({
  path,
  content,
  workspaceId,
}: WriteFileInput): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws.filesystem.writable || !ws.filesystem.writeFile) {
    throw new Error(
      `[agent-tools] Filesystem "${ws.filesystem.id}" is read-only`,
    );
  }
  await ws.filesystem.writeFile(path, content);
}

interface ListDirectoryInput extends WithWorkspace {
  path: string;
}

export async function listWorkspaceDirectory({
  path,
  workspaceId,
}: ListDirectoryInput) {
  const ws = getWorkspace(workspaceId);
  return ws.filesystem.listChildren(path);
}

interface OpenFileInput extends WithWorkspace {
  path: string;
  /** Override the detected language id. */
  language?: string;
}

/**
 * Open a workspace file in the editor. Fetches content via the adapter,
 * pushes a new editor tab, and sets it active.
 */
export async function openWorkspaceFile({
  path,
  language,
  workspaceId,
}: OpenFileInput): Promise<void> {
  const ws = getWorkspace(workspaceId);
  const content = await ws.filesystem.readFile(path);
  const name = path.split("/").pop() ?? path;
  ws.store.dispatch(
    openTab({
      id: `${ws.filesystem.id}:${path}`,
      path,
      name,
      language: language ?? languageFromFilename(name),
      content,
      pristineContent: content,
    }),
  );
}

interface AppendTerminalOutputInput extends WithWorkspace {
  text: string;
  kind?: "stdout" | "stderr" | "info";
}

/**
 * Emit a line into the terminal without running a command — handy for agent
 * status messages ("Running plan step 3…").
 */
export function appendAgentTerminalLine({
  text,
  kind = "info",
  workspaceId,
}: AppendTerminalOutputInput): void {
  const ws = getWorkspace(workspaceId);
  ws.store.dispatch(
    appendLine({
      type: kind,
      text,
      tab: "terminal",
      source: "agent",
    }),
  );
}
