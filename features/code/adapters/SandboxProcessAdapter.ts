import type {
  ProcessAdapter,
  PtyHandle,
  PtyOpenOptions,
} from "./ProcessAdapter";
import type { ProcessEvent, ProcessResult } from "../types";

/** Matches the response shape of /api/sandbox/[id]/exec */
interface RawExecResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
  cwd?: string;
}

interface SandboxPtyCredential {
  token: string;
  ws_base: string;
  sandbox_id: string;
}

/**
 * Sandbox ProcessAdapter.
 *
 * The orchestrator (Python/FastAPI service behind /api/sandbox/[id]/exec)
 * already maintains per-sandbox session state including the current working
 * directory — `cd foo && pwd` persists across calls and the response carries
 * the updated `cwd`. We mirror that value locally so the UI can render a
 * prompt, but we DO NOT wrap commands or force the cwd: doing so stomps on
 * the server's session state and breaks `cd`.
 */
export class SandboxProcessAdapter implements ProcessAdapter {
  readonly id: string;
  isReady = true;
  cwd: string;

  constructor(
    public readonly instanceId: string,
    initialCwd = "/home/agent",
  ) {
    this.id = `sandbox:${instanceId}`;
    this.cwd = initialCwd;
  }

  async exec(
    command: string,
    opts?: {
      cwd?: string;
      timeoutSec?: number;
      env?: Record<string, string>;
      stdin?: string;
    },
  ): Promise<ProcessResult> {
    const body: Record<string, unknown> = {
      command,
      timeout: opts?.timeoutSec ?? 60,
    };
    if (opts?.cwd) body.cwd = opts.cwd;
    if (opts?.env) body.env = opts.env;
    if (opts?.stdin !== undefined) body.stdin = opts.stdin;

    const resp = await fetch(`/api/sandbox/${this.instanceId}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => resp.statusText);
      throw new Error(`exec failed (${resp.status}): ${errBody}`);
    }
    const data: RawExecResponse = await resp.json();
    if (data.cwd) this.cwd = data.cwd;

    return {
      stdout: data.stdout ?? "",
      stderr: data.stderr ?? "",
      exitCode: data.exit_code ?? 0,
      cwd: this.cwd,
    };
  }

  /**
   * Streaming exec via SSE. Stdout/stderr arrive incrementally via `onEvent`;
   * the returned ProcessResult resolves when the orchestrator emits the `exit`
   * event. Aborting the AbortSignal closes the SSE connection — the
   * orchestrator interprets that as cancellation and SIGTERMs the command.
   */
  async stream(
    command: string,
    onEvent: (ev: ProcessEvent) => void,
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: string;
      signal?: AbortSignal;
    },
  ): Promise<ProcessResult> {
    const body: Record<string, unknown> = { command };
    if (opts?.cwd) body.cwd = opts.cwd;
    if (opts?.env) body.env = opts.env;
    if (opts?.stdin !== undefined) body.stdin = opts.stdin;

    const resp = await fetch(`/api/sandbox/${this.instanceId}/exec/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    if (!resp.ok || !resp.body) {
      const errBody = await resp.text().catch(() => resp.statusText);
      throw new Error(`exec/stream failed (${resp.status}): ${errBody}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    let cwd = this.cwd;
    let eventCount = 0;

    // Robust SSE parsing — the standard says events are separated by blank
    // lines; data lines start with "data: ". Multi-line data values are joined
    // with "\n".
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Drain complete events (terminated by a blank line) from the buffer.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!rawEvent.trim()) continue;

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:"))
            dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (!dataLines.length) continue;
        eventCount += 1;

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          // Some daemons emit raw text — wrap as text payload so we don't lose it.
          payload = { data: dataLines.join("\n") };
        }

        if (eventName === "stdout") {
          const text = String(payload.data ?? "");
          stdout += text;
          onEvent({ type: "stdout", text });
        } else if (eventName === "stderr") {
          const text = String(payload.data ?? "");
          stderr += text;
          onEvent({ type: "stderr", text });
        } else if (eventName === "exit") {
          exitCode = Number(payload.exit_code ?? 0);
          if (typeof payload.cwd === "string") cwd = payload.cwd;
          onEvent({
            type: "exit",
            text: "",
            exitCode,
            cwd,
          });
        } else {
          onEvent({ type: "info", text: String(payload.data ?? "") });
        }
      }
    }

    if (eventCount === 0) {
      throw new Error(
        "Streaming terminal returned HTTP 200 with no events; buffered fallback required",
      );
    }

    if (cwd) this.cwd = cwd;
    return { stdout, stderr, exitCode, cwd };
  }

  /**
   * Open a PTY session.
   *
   * Mints a short-lived, sandbox-bound `pty` credential through the existing
   * ownership-checking route, then connects the browser directly to the
   * orchestrator. Vercel route handlers cannot complete WebSocket upgrades.
   *
   * Each frame is a single JSON object terminated by `\n`. Falls back
   * gracefully when the browser cannot reach the WebSocket — the caller
   * can drop back to read-line emulation.
   */
  async openPty(opts: PtyOpenOptions): Promise<PtyHandle> {
    if (typeof window === "undefined") {
      throw new Error("openPty is only available in the browser");
    }

    const credentialResponse = await fetch(
      `/api/sandbox/${encodeURIComponent(this.instanceId)}/access-tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["pty"], single_use: true }),
      },
    );
    if (!credentialResponse.ok) {
      const detail = await credentialResponse.text().catch(() => "");
      throw new Error(
        `PTY credential mint failed (${credentialResponse.status}): ${detail}`,
      );
    }
    const credential =
      (await credentialResponse.json()) as Partial<SandboxPtyCredential>;
    if (!credential.token || !credential.ws_base || !credential.sandbox_id) {
      throw new Error(
        "PTY credential response is missing token, ws_base, or sandbox_id",
      );
    }

    const params = new URLSearchParams();
    if (opts.cols) params.set("cols", String(opts.cols));
    if (opts.rows) params.set("rows", String(opts.rows));
    if (opts.cwd) params.set("cwd", opts.cwd);
    if (opts.shell) params.set("shell", opts.shell);
    if (opts.env) params.set("env", JSON.stringify(opts.env));
    params.set("access_token", credential.token);
    const url = `${credential.ws_base.replace(/\/$/, "")}/sandboxes/${encodeURIComponent(credential.sandbox_id)}/pty?${params.toString()}`;

    const socket = new WebSocket(url);
    let isOpen = false;
    let closed = false;

    const send = (frame: object) => {
      if (!isOpen || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify(frame));
      } catch {
        /* socket may have flipped to CLOSING — ignore */
      }
    };

    const handle: PtyHandle = {
      get isOpen() {
        return isOpen && !closed;
      },
      write(data: string) {
        send({ type: "input", data });
      },
      resize(cols: number, rows: number) {
        send({ type: "resize", cols, rows });
      },
      signal(name: string) {
        send({ type: "signal", signal: name });
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          socket.close(1000, "client closed");
        } catch {
          /* ignore */
        }
      },
    };

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw) return;
      // Daemon may send either single JSON object frames or NDJSON when
      // batched. Split on newlines and parse each non-empty line.
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        let msg: Record<string, unknown> | null = null;
        try {
          msg = JSON.parse(line);
        } catch {
          // Malformed frame — pass the raw bytes through so users still
          // see something sensible if the daemon ever degrades.
          opts.onData(line);
          continue;
        }
        if (!msg) continue;
        if (msg.type === "output") {
          opts.onData(typeof msg.data === "string" ? msg.data : "");
        } else if (msg.type === "exit") {
          opts.onExit?.(
            typeof msg.code === "number" ? msg.code : null,
            typeof msg.signal === "string" ? msg.signal : null,
          );
        } else if (msg.type === "error") {
          opts.onError?.(
            new Error(
              typeof msg.message === "string" ? msg.message : "PTY error",
            ),
          );
        } else if (msg.type === "ready") {
          opts.onReady?.();
        }
        // Ignore unknown frame types so the daemon can extend without
        // breaking older clients.
      }
    };

    // The Promise resolves only once the socket is actually OPEN — that
    // way callers can safely swap their input listener over to the PTY
    // without losing keystrokes during the connect window. If the
    // connection fails (host unreachable, auth failure, …) the Promise
    // rejects and the caller can stay on the buffered fallback.
    return await new Promise<PtyHandle>((resolve, reject) => {
      const CONNECT_TIMEOUT_MS = 4000;
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => {
          try {
            socket.close(4000, "connect timeout");
          } catch {
            /* ignore */
          }
          reject(new Error("PTY connect timeout"));
        });
      }, CONNECT_TIMEOUT_MS);

      // Track whether the WebSocket ever reached OPEN. A rejected credential
      // or unreachable orchestrator goes straight from CONNECTING to CLOSED;
      // in that case `onExit` must not claim a PTY existed.
      let everOpened = false;

      socket.onopen = () => {
        clearTimeout(timer);
        isOpen = true;
        everOpened = true;
        // Some daemons don't emit an explicit ready frame — synthesise one
        // so the consumer's `onReady` always fires once.
        opts.onReady?.();
        settle(() => resolve(handle));
      };
      socket.onerror = () => {
        // Only surface a transport error if we'd already opened (a real
        // mid-session failure). A pre-open onerror is the same code path
        // as a clean connect-refused and should be silent so the buffered
        // fallback can take over without the user seeing any noise.
        if (everOpened) {
          opts.onError?.(new Error("PTY transport error"));
        }
        clearTimeout(timer);
        settle(() => reject(new Error("PTY transport error")));
      };
      socket.onclose = () => {
        isOpen = false;
        if (!closed) {
          closed = true;
          // Only fire onExit if the PTY was actually open. If the socket
          // never reached OPEN (e.g. 426 on Vercel, blocked port,
          // unreachable host), the consumer's onExit handler would write a
          // confusing "[pty closed]" line to the terminal even though the
          // buffered/SSE path is the real one in use.
          if (everOpened) opts.onExit?.(null, null);
        }
        clearTimeout(timer);
        settle(() => reject(new Error("PTY connection closed before open")));
      };
    });
  }
}

/**
 * Simple mock: pretends commands ran and echoes them. Good enough for the
 * default route when there's no active sandbox.
 */
export class MockProcessAdapter implements ProcessAdapter {
  readonly id = "mock";
  isReady = true;
  cwd = "/workspace";

  async exec(command: string): Promise<ProcessResult> {
    const trimmed = command.trim();
    // Minimal `cd` support so the mock feels less broken when users poke
    // at it without a real sandbox.
    const cdMatch = trimmed.match(/^cd\s+(\S+)$/);
    if (cdMatch) {
      const target = cdMatch[1];
      if (target === "~" || target === "") {
        this.cwd = "/workspace";
      } else if (target.startsWith("/")) {
        this.cwd = target;
      } else if (target === "..") {
        this.cwd = this.cwd.replace(/\/[^/]+$/, "") || "/";
      } else {
        this.cwd = `${this.cwd.replace(/\/$/, "")}/${target}`;
      }
      return { stdout: "", stderr: "", exitCode: 0, cwd: this.cwd };
    }

    return {
      stdout: `(mock) $ ${command}\n(no sandbox connected — select one from the Sandboxes view)\n`,
      stderr: "",
      exitCode: 0,
      cwd: this.cwd,
    };
  }
}
