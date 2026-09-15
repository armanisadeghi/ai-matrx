"use client";

/**
 * SandboxCanvasBody — the live view of a bound sandbox, rendered INSIDE the
 * Canvas pane (`CanvasBody` → `case "sandbox"`).
 *
 * THE PROBLEM IT EXISTS FOR (owner, 2026-09-13): *"a user from the chat
 * interface is blind as to what is going on in the sandbox."* The agent runs
 * commands, writes files, clones repos — and the room showed a spinner and,
 * afterwards, a key/value dump.
 *
 * WHY IT IS A CANVAS TYPE AND NOT A PANEL (owner, same day, on the first
 * attempt): the chat's right-hand region is SHARED — the Cloud Browser, open
 * documents and artifacts all live there. A second bespoke column that is
 * permanently on screen covers the app and owns a region it does not own.
 * The champions agree: Claude Code, Codex and Cursor all keep ONE side region
 * and show the terminal in it ON DEMAND when the agent runs a command; the
 * user switches back and forth. So the sandbox is one more canvas content
 * type beside `cloud_browser` / `working_document` / artifacts, and it
 * inherits the canvas's collapse, resize, split, switcher and z-order.
 *
 * This body renders BARE — no border, no background, no title bar, no close
 * button — because `CanvasPane` already draws the frame and the header
 * ("a host frame either IS the chrome or has none").
 *
 * Every component below is the canonical one the other sandbox surfaces use
 * (THE PANEL WRAPS THE CANONICAL COMPONENT) — nothing is re-implemented.
 *
 * 🚨 NO DEAD CONTROLS AND NO LYING SPINNER. When the bound box is stopped,
 * expired or failed, the body says so and states the real remedy — the same
 * remedy the pre-send gate gives, because it is the same situation — instead
 * of mounting a terminal that will never connect.
 */

import React from "react";
import { Box, FolderTree, ListTree, TerminalSquare } from "lucide-react";

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

/** How often the status strip re-reads the box's row while the pane is open. */
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
 * uses — rather than opening a second one for this pane.
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
          // Loud, with the reason — never a silent empty strip.
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

export interface SandboxCanvasBodyProps {
  /** The box this pane shows — the canvas pointer's `sandboxRowId`. */
  sandboxRowId: string;
  /** The chat whose sandbox work the Activity tab lists, when there is one. */
  conversationId?: string;
  /** Label latched at binding time — paints the strip before the row lands. */
  fallbackName?: string | null;
  className?: string;
}

export function SandboxCanvasBody({
  sandboxRowId,
  conversationId,
  fallbackName,
  className,
}: SandboxCanvasBodyProps) {
  const [tab, setTab] = React.useState<Tab>("activity");
  const { instance, error, loading } = useSandboxRow(sandboxRowId);

  // "Live" = a sandbox tool is running RIGHT NOW in this conversation. Derived
  // from the same lifecycle map the transcript renders from, so the dot can
  // never disagree with what the thread shows.
  const liveSelector = React.useMemo(
    () => selectLiveToolLifecycleByConversation(conversationId ?? ""),
    [conversationId],
  );
  const live = useAppSelector(liveSelector);
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
  const reachable =
    status !== null && ACTIVE_EFFECTIVE_STATUSES.includes(status);
  // ONE IDENTITY. Before the row lands we know only the row id, so the label
  // is built from the SAME canonical formatter with the same short id — the
  // strip never swaps one identity ("Sandbox · 2c23df07") for a different one
  // ("Unnamed · 7942bd") the moment a fetch resolves.
  const name = instance
    ? sandboxDisplayName({ ...instance, id: instance.id ?? sandboxRowId })
    : fallbackName?.trim() || sandboxDisplayName({ id: sandboxRowId });
  const tier = instance?.tier ?? instance?.config?.tier ?? null;
  const template = instance?.config?.template ?? null;

  return (
    <div
      data-testid="sandbox-canvas-body"
      className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
    >
      {/* Which box, what tier/template, is it alive, is it busy. Content, not
          chrome — the pane header above already says "Sandbox". */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
        <Box className="size-4 shrink-0 text-emerald-500" />
        {/* The identifying part is never clipped: the derived name ends in the
            short id, and a truncating span would cut exactly the characters
            that say WHICH box this is. */}
        <p
          data-testid="sandbox-identity"
          className="min-w-0 shrink-0 text-xs font-medium text-foreground"
          title={name}
        >
          {name}
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {/* ONE STATUS SOURCE for the box: the row's effective lifecycle. It
              is always stated — an absent pill read as "no status" beside a
              dot that said "Idle", which is a different question entirely. */}
          <span
            data-testid="sandbox-status-pill"
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              status
                ? statusPillClasses(status)
                : "bg-muted text-muted-foreground",
            )}
          >
            {status
              ? STATUS_LABELS[status]
              : error
                ? "Unreadable"
                : "Checking…"}
          </span>
          {tier && <span>{tier}</span>}
          {template && <span>{template}</span>}
          {/* A DIFFERENT AXIS, said out loud. This is not the box's status —
              it is whether the agent is running a sandbox tool in this chat
              right now. Unlabelled, "Idle" beside "Running" read as two
              status sources contradicting each other. */}
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                busy
                  ? "animate-pulse bg-emerald-500"
                  : "bg-muted-foreground/40",
              )}
            />
            {busy ? "Agent working" : "Agent idle"}
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border px-2 pb-1">
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
          conversationId ? (
            <SandboxActivityFeed conversationId={conversationId} />
          ) : (
            <PaneNotice
              title="No conversation attached"
              body="Activity lists the sandbox work of one conversation, and this pane was opened without one."
              remedy="Open the sandbox from a chat that is bound to it — the Terminal and Files tabs work here either way."
            />
          )
        ) : error ? (
          <PaneNotice
            title="This sandbox can't be read"
            body={error}
            remedy="Attach or start a sandbox from the chat input's sandbox control, then reopen this pane."
          />
        ) : loading ? (
          <PaneNotice
            title="Reading the sandbox…"
            body="Fetching the bound box's current state."
          />
        ) : !reachable ? (
          <PaneNotice
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
function PaneNotice({
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

export default SandboxCanvasBody;
