/**
 * The device console's terminal: the device's running shells as chips (+ starts another), one
 * live shell in @ai-matrx/terminal. The shell's resource id lives in the URL (?t=), so a reload
 * reattaches to the same shell (a screen snapshot, then live); a dropped socket — a locked phone,
 * a tunnel — is reattached by the client with since_seq, so missed output replays byte for byte.
 * Bytes are credited only after xterm has parsed them: a slow phone slows the Mac's PTY, never
 * the other way round.
 */

"use client";

import "@/styles/terminal-host.css";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Terminal } from "@ai-matrx/terminal/react";
import type { TerminalHandle, TerminalSize } from "@ai-matrx/terminal/react";
import { isDesktopProtocolError } from "@ai-matrx/desktop-protocol/client";
import type { DesktopClient, DesktopStream, StreamHandlers } from "@ai-matrx/desktop-protocol/client";
import type { PtyInfo } from "@ai-matrx/desktop-protocol";
import { useIsMobile } from "@ai-matrx/kit/media-query";

import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

/** Bytes the Mac may send before this browser credits them back (the protocol default is 256 KiB). */
const WINDOW_BYTES = 262_144;
const RESIZE_DEBOUNCE_MS = 120;
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

type LiveStream = DesktopStream<"exec.pty.start"> | DesktopStream<"session.attach">;

export interface TerminalPanelProps {
  client: DesktopClient;
  /** The client is open (Live). */
  live: boolean;
  /** Resource id from the URL, or null. */
  resourceId: string | null;
  onResourceChange: (resourceId: string | null) => void;
  /** Hidden panels keep their shell and screen; they only stop taking space. */
  visible: boolean;
  /** Phone only: another view (Info) has the screen; desktop keeps the terminal. */
  hiddenOnPhone?: boolean;
}

function chipLabel(pty: PtyInfo, index: number, all: PtyInfo[]): string {
  const base = pty.name || pty.title || pty.shell.split("/").pop() || "Terminal";
  const same = all.filter((p) => (p.name || p.title || p.shell.split("/").pop()) === base);
  return same.length > 1 ? `${base} ${index + 1}` : base;
}

export function TerminalPanel({ client, live, resourceId, onResourceChange, visible, hiddenOnPhone = false }: TerminalPanelProps) {
  const isMobile = useIsMobile();
  const termRef = useRef<TerminalHandle | null>(null);
  const streamRef = useRef<LiveStream | null>(null);
  const sizeRef = useRef<TerminalSize>({ cols: 80, rows: 24 });
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<PtyInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(resourceId);
  /** Why there is no live shell right now, when there should be one. */
  const [ended, setEnded] = useState<"exited" | "gone" | "failed" | null>(null);

  async function refreshSessions(): Promise<PtyInfo[]> {
    try {
      const { sessions: all } = await client.request("exec.list", {});
      const running = all.filter((s) => s.state === "running").sort((a, b) => a.created_at_ms - b.created_at_ms);
      setSessions(running);
      return running;
    } catch {
      return sessions; // offline: keep the chips we had
    }
  }

  function sendResize(id: string): void {
    const { cols, rows } = sizeRef.current;
    void client.request("exec.pty.resize", { resource_id: id, cols, rows }).catch(() => undefined);
  }

  function handlersFor(stream: () => LiveStream | null): StreamHandlers {
    return {
      onData: (bytes) => termRef.current?.write(bytes),
      onSnapshot: (bytes) => termRef.current?.write(bytes),
      onMeta: (meta) => {
        // A screen snapshot replaces whatever this xterm showed (a reload, or a gap past the ring).
        if (meta.kind === "snapshot") termRef.current?.reset();
      },
      onReattached: () => {
        const s = stream();
        if (s?.resourceId) sendResize(s.resourceId);
      },
    };
  }

  function follow(stream: LiveStream): void {
    streamRef.current = stream;
    setEnded(null);
    stream.done.then(
      (reason) => {
        if (streamRef.current !== stream) return; // switched away on purpose
        streamRef.current = null;
        if (reason === "resource_exited") {
          void termRef.current?.write(`\r\n${DIM}[Process exited]${RESET}\r\n`);
          setEnded("exited");
          setActiveId(null);
          onResourceChange(null);
          void refreshSessions();
        }
      },
      (error: unknown) => {
        if (streamRef.current !== stream) return;
        streamRef.current = null;
        if (isDesktopProtocolError(error) && (error.code === "RESOURCE_GONE" || error.code === "NOT_FOUND")) {
          void termRef.current?.write(`\r\n${DIM}[This terminal is gone]${RESET}\r\n`);
          setEnded("gone");
          setActiveId(null);
          onResourceChange(null);
          void refreshSessions();
          return;
        }
        setEnded("failed");
        toast.error("The terminal stopped", { description: error instanceof Error ? error.message : String(error) });
      },
    );
  }

  function attach(id: string): void {
    termRef.current?.reset();
    let stream: LiveStream | null = null;
    stream = client.stream("session.attach", { resource_id: id, mode: "control" }, handlersFor(() => stream), { windowBytes: WINDOW_BYTES });
    setActiveId(id);
    onResourceChange(id);
    follow(stream);
    stream.result.then(() => sendResize(id), () => undefined);
  }

  function start(): void {
    if (startingRef.current) return;
    startingRef.current = true;
    termRef.current?.reset();
    const { cols, rows } = sizeRef.current;
    let stream: LiveStream | null = null;
    stream = client.stream("exec.pty.start", { cols, rows }, handlersFor(() => stream), { windowBytes: WINDOW_BYTES });
    follow(stream);
    stream.result.then(
      (info) => {
        startingRef.current = false;
        setActiveId(info.resource_id);
        onResourceChange(info.resource_id);
        void refreshSessions();
      },
      () => {
        startingRef.current = false;
      },
    );
  }

  async function switchTo(id: string): Promise<void> {
    if (id === activeId && streamRef.current) {
      termRef.current?.focus();
      return;
    }
    const old = streamRef.current;
    streamRef.current = null;
    // Leave the old shell running on the Mac; only this screen stops following it.
    if (old) await old.detach().catch(() => undefined);
    attach(id);
  }

  async function closeSession(id: string): Promise<void> {
    const ok = await confirm({
      title: "Close this terminal?",
      description: "The shell and anything running in it stop on the computer.",
      confirmLabel: "Close terminal",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await client.request("exec.pty.kill", { resource_id: id, grace_ms: 2000 });
    } catch (error) {
      toast.error("Could not close the terminal", { description: error instanceof Error ? error.message : String(error) });
    }
    void refreshSessions();
  }

  // First connection: reattach to the shell in the URL, else the oldest running one, else a new one.
  useEffect(() => {
    if (!live || !ready || streamRef.current || startingRef.current || ended !== null) return;
    void (async () => {
      const running = await refreshSessions();
      if (streamRef.current || startingRef.current) return;
      const wanted = resourceId ?? activeId;
      if (wanted && running.some((s) => s.resource_id === wanted)) attach(wanted);
      else if (running[0]) attach(running[0].resource_id);
      else start();
    })();
    // Runs when the connection opens or the terminal mounts; the handlers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ready]);

  // A reconnect brings other people's (or agents') shells: refresh the chips.
  useEffect(() => {
    if (live && ready) void refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    return () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, []);

  function onResize(size: TerminalSize): void {
    sizeRef.current = size;
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => {
      const id = streamRef.current?.resourceId;
      if (id) sendResize(id);
    }, RESIZE_DEBOUNCE_MS);
  }

  function onData(data: string): void {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      stream.write(data);
    } catch {
      // The stream ended between the keystroke and now; its done handler says why.
    }
  }

  const showChips = sessions.length > 0 || activeId !== null;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !visible && "hidden", hiddenOnPhone && "max-lg:hidden")}>
      <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:px-3" role="tablist" aria-label="Terminals">
        {showChips
          ? sessions.map((pty, i) => {
              const active = pty.resource_id === activeId;
              return (
                <div
                  key={pty.resource_id}
                  className={cn(
                    "flex h-7 shrink-0 items-center rounded-full border text-[13px] transition-colors",
                    active ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={cn("h-full max-w-[160px] truncate pl-3", active ? "pr-1" : "pr-3")}
                    onClick={() => void switchTo(pty.resource_id)}
                  >
                    {chipLabel(pty, i, sessions)}
                  </button>
                  {active ? (
                    <button
                      type="button"
                      aria-label="Close terminal"
                      className="mr-1 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => void closeSession(pty.resource_id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })
          : null}
        <button
          type="button"
          aria-label="New terminal"
          disabled={!live}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={async () => {
            const old = streamRef.current;
            streamRef.current = null;
            if (old) await old.detach().catch(() => undefined);
            start();
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden lg:mx-3 lg:mb-3 lg:rounded-lg lg:border lg:border-border">
        <Terminal
          fit={isMobile ? "viewport" : "container"}
          aria-label="Terminal on this computer"
          onReady={(handle) => {
            termRef.current = handle;
            setReady(true);
          }}
          onResize={onResize}
          onData={onData}
        >
          {ended !== null ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <button
                type="button"
                disabled={!live}
                className="pointer-events-auto h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow disabled:opacity-50"
                onClick={() => start()}
              >
                New terminal
              </button>
            </div>
          ) : null}
        </Terminal>
      </div>
    </div>
  );
}
