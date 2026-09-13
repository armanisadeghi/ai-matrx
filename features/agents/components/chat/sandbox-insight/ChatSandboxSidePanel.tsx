"use client";

/**
 * ChatSandboxSidePanel — the chat room's live window into the bound sandbox.
 *
 * THE PROBLEM IT EXISTS FOR (owner, 2026-09-13): *"a user from the chat
 * interface is blind as to what is going on in the sandbox."* The agent runs
 * commands, writes files, clones repos — and the room showed a spinner and,
 * afterwards, a key/value dump. The Creator Hub already had a live sandbox
 * view; it was reachable only from an admin-gated window panel.
 *
 * The bar: Cursor's agent terminal (a real, attached terminal beside the
 * conversation, not a log dump) and Vercel v0's file view (the working tree,
 * browsable while the agent is mid-task). Three tabs, no more:
 *
 *   Terminal — `SimpleTerminal` attached to the SAME box the agent's tools
 *              act in (the canonical binding resolver, not a second lookup).
 *   Files    — `SandboxFileViewer` rooted at the agent's home.
 *   Activity — this conversation's sandbox tool calls as they happen.
 *
 * Every component here is the canonical one the other sandbox surfaces use
 * (THE PANEL WRAPS THE CANONICAL COMPONENT) — nothing is re-implemented.
 *
 * 🚨 NO DEAD CONTROLS AND NO LYING SPINNER. When the bound box is stopped,
 * expired or failed, the body says so and states the real remedy — the same
 * remedy the pre-send gate gives, because it is the same situation — instead
 * of mounting a terminal that will never connect.
 */

import React from "react";
import { Box, FolderTree, ListTree, TerminalSquare, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { SimpleTerminal } from "@/features/code/terminal/SimpleTerminal";
import { SandboxFileViewer } from "@/features/agents/components/debug/SandboxFileViewer";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import {
  ACTIVE_EFFECTIVE_STATUSES,
  getEffectiveStatus,
  statusPillClasses,
  STATUS_LABELS,
} from "@/lib/sandbox/status";
import type { SandboxInstance } from "@/types/sandbox";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { SandboxActivityFeed } from "./SandboxActivityFeed";
import { isSandboxTool } from "./sandbox-activity";

/** The agent's working directory in every sandbox image. */
const AGENT_HOME = "/home/agent";

/** How often the header re-reads the box's row while the panel is open. */
const STATUS_POLL_MS = 20_000;

type Tab = "terminal" | "files" | "activity";

const TABS: ReadonlyArray<{
  id: Tab;
  label: string;
  icon: typeof TerminalSquare;
}> = [
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "activity", label: "Activity", icon: ListTree },
];

/**
 * The bound box's row. Read through the existing `/api/sandbox/[id]` route —
 * the one canonical read path every sandbox surface in this repo already
 * uses — rather than opening a second one for this panel.
 */
function useSandboxRow(sandboxRowId: string): {
  instance: SandboxInstance | null;
  error: string | null;
  loading: boolean;
} {
  const [instance, setInstance] = React.useState<SandboxInstance | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const read = async () => {
      try {
        const res = await fetch(`/api/sandbox/${sandboxRowId}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as {
          instance?: SandboxInstance;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.instance) {
          // Loud, with the reason — never a silent empty header.
          setError(
            body.error ??
              `Couldn't read this sandbox (HTTP ${res.status}). It may have been deleted.`,
          );
          setInstance(null);
        } else {
          setError(null);
          setInstance(body.instance);
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't reach the sandbox service.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void read();
    const timer = setInterval(() => void read(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [sandboxRowId]);

  return { instance, error, loading };
}

interface ChatSandboxSidePanelProps {
  conversationId: string;
  sandboxRowId: string;
  /** Label latched at binding time — paints the header before the row lands. */
  fallbackName?: string | null;
  onClose: () => void;
  className?: string;
}

export function ChatSandboxSidePanel({
  conversationId,
  sandboxRowId,
  fallbackName,
  onClose,
  className,
}: ChatSandboxSidePanelProps) {
  const [tab, setTab] = React.useState<Tab>("activity");
  const { instance, error, loading } = useSandboxRow(sandboxRowId);

  // "Live" = a sandbox tool is running RIGHT NOW in this conversation. Derived
  // from the same lifecycle map the transcript renders from, so the dot can
  // never disagree with what the thread shows.
  const live = useAppSelector(
    selectLiveToolLifecycleByConversation(conversationId),
  );
  const busy = live
    ? [...live.values()].some(
        (entry) =>
          isSandboxTool(entry.toolName) &&
          (entry.status === "started" ||
            entry.status === "progress" ||
            entry.status === "step"),
      )
    : false;

  const status = instance ? getEffectiveStatus(instance) : null;
  const reachable = status !== null && ACTIVE_EFFECTIVE_STATUSES.includes(status);
  const name = instance
    ? sandboxDisplayName(instance)
    : (fallbackName?.trim() || `Sandbox · ${sandboxRowId.slice(0, 8)}`);
  const tier = instance?.tier ?? instance?.config?.tier ?? null;
  const template = instance?.config?.template ?? null;

  return (
    <div
      data-testid="chat-sandbox-panel"
      className={cn("flex h-full flex-col overflow-hidden bg-card", className)}
    >
      {/* Header — which box, what tier/template, is it alive, is it busy. */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <Box className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {name}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {status && (
                <span
                  data-testid="sandbox-status-pill"
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    statusPillClasses(status),
                  )}
                >
                  {STATUS_LABELS[status]}
                </span>
              )}
              {tier && <span>{tier}</span>}
              {template && <span>{template}</span>}
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    busy
                      ? "animate-pulse bg-emerald-500"
                      : "bg-muted-foreground/40",
                  )}
                />
                {busy ? "Working" : "Idle"}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the sandbox panel"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
              tab === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Activity reads Redux only — it works whether or not the box is
            reachable, and it is the honest thing to show when it is not. */}
        {tab === "activity" ? (
          <SandboxActivityFeed conversationId={conversationId} />
        ) : error ? (
          <PanelNotice
            title="This sandbox can't be read"
            body={error}
            remedy="Attach or start a sandbox from the chat input's sandbox control, then reopen this panel."
          />
        ) : loading ? (
          <PanelNotice
            title="Reading the sandbox…"
            body="Fetching the bound box's current state."
          />
        ) : !reachable ? (
          <PanelNotice
            title={`Sandbox ${status ? STATUS_LABELS[status].toLowerCase() : "unavailable"}`}
            body="This conversation is bound to a sandbox, but it can't be reached right now (it may be stopped, expired, or still starting)."
            remedy="Attach or start a sandbox from the chat input's sandbox control and retry — or send without a sandbox. The Activity tab still shows everything that already ran."
          />
        ) : tab === "terminal" ? (
          <div className="h-full overflow-hidden">
            <SimpleTerminal sandboxId={sandboxRowId} />
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            <SandboxFileViewer
              sandboxRowId={sandboxRowId}
              initialPath={AGENT_HOME}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** An honest body: what is true, and what to do about it. Never a spinner. */
function PanelNotice({
  title,
  body,
  remedy,
}: {
  title: string;
  body: string;
  remedy?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
      {remedy && (
        <p className="max-w-xs text-xs text-muted-foreground">{remedy}</p>
      )}
    </div>
  );
}
