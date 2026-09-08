"use client";

/**
 * matrxLocalRuntime — the browser's door to the LOCAL Claude Code runtime
 * running inside the user's Matrx Local desktop app.
 *
 * The browser cannot reach localhost on the user's machine. The EXISTING
 * relay is the per-user Supabase Broadcast bridge channel
 * `matrx-local-bridge:<userId>`: the Matrx Local engine subscribes to it and
 * dispatches v2 `kind:"rpc"` envelopes into the same command registry that
 * serves its ~80-tool dispatcher, replying on the same channel with
 * `action: "<action>.result"` + the same `requestId`. No new service, no new
 * database, no inbound port on the user's machine.
 *
 * Engine-side handlers: matrx-local `app/api/coding_runtime_handlers.py`.
 * Envelope contract: matrx-local `app/api/cross_component_envelope.py`
 * (Python mirror of `lib/types/bridge-envelope.ts`).
 *
 * Truthfulness rule: a timeout means "Matrx Local is not reachable right
 * now" — it is reported exactly as that, never as a guess about capability.
 *
 * REALTIME — A FOREIGN PEER OWNS THIS WIRE.
 * ----------------------------------------
 * `@ai-matrx/realtime` owns the channel, in RAW WIRE mode. The other end is a
 * separately released program: the deployed Matrx Local desktop app parses this
 * exact v2 envelope shape (`app/api/cross_component_envelope.py`) on this exact
 * topic. Wrapping it in the Matrx envelope, or renaming the topic to an `mx:`
 * name, would put this browser in a room of one while the engine kept listening
 * where it always did — silently, with nothing failing loudly at either end.
 * So `foreignTopic` keeps the peer's topic verbatim and `wire: {mode:"raw"}`
 * puts the payload on the wire byte-identically (README § 9).
 *
 * The raw downgrade is bought back, not accepted: `isOwnMessage` uses the
 * envelope's own `direction` (our sends are always `frontend->local`), so echo
 * suppression is real here rather than leaning on `broadcast.self:false`; and
 * `eventKey` gives dedup a key, which the hand-rolled version had none of.
 *
 * WHAT ELSE THIS ADOPTION DELETED: a channel opened and removed PER RPC, and
 * the module-level `rpcQueue` that serialized every call. That queue existed
 * only because supabase-js keeps one channel per topic and two concurrent
 * subscribes to a fixed topic race ("tried to subscribe multiple times"). The
 * package's ref-counted room registry is exactly that problem solved, so the
 * calls now share ONE long-lived channel and no longer queue behind each other.
 */

import { createClient } from "@/utils/supabase/client";
import {
  defineChannelNamespace,
  onRealtimeManagerChange,
  type ChannelHandle,
  type ChannelSpec,
} from "@ai-matrx/realtime";

/**
 * Matrx Local's per-user bridge channel (its engine subscribes to this).
 * The topic string is the PEER's contract — see the file header.
 */
const matrxLocalChannel = defineChannelNamespace({
  namespace: "matrx-local-bridge",
  parts: ["userId"],
  description:
    "matrx-local desktop app RPC bridge (foreign wire, v2 rpc envelope)",
  foreignTopic: "matrx-local-bridge",
});

export function matrxLocalChannelName(userId: string): string {
  return matrxLocalChannel.topic({ userId });
}

/** The v2 envelope both ends read. Shape owned by the peer. */
interface LocalEnvelope {
  v: number;
  kind: string;
  direction: string;
  action: string;
  requestId: string;
  payload?: unknown;
  timestamp?: number;
  fromInstance?: Record<string, unknown>;
  toInstance?: Record<string, unknown>;
}

function asLocalEnvelope(payload: unknown): LocalEnvelope | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Partial<LocalEnvelope>;
  if (
    typeof candidate.direction !== "string" ||
    typeof candidate.action !== "string" ||
    typeof candidate.requestId !== "string"
  ) {
    return null;
  }
  return candidate as LocalEnvelope;
}

const BROADCAST_EVENT = "message";
const DEFAULT_TIMEOUT_MS = 8_000;

export type LocalRuntimeCapability = {
  state: "loading" | "ready" | "unreachable";
  available: boolean;
  reasons: string[];
  claudeCli: string | null;
  claudeAccountLabel: string | null;
  workspaceRoots: string[];
  approvedFolders: string[];
  activeRuns: number;
};

export const INITIAL_LOCAL_CAPABILITY: LocalRuntimeCapability = {
  state: "loading",
  available: false,
  reasons: [],
  claudeCli: null,
  claudeAccountLabel: null,
  workspaceRoots: [],
  approvedFolders: [],
  activeRuns: 0,
};

export type LocalRuntimeRun = {
  runtime_id: string;
  session_id: string;
  action: "start" | "resume";
  status: "starting" | "running" | "completed" | "failed" | "cancelled";
  workspace: string;
  provider_session_id: string | null;
  conversation_id: string | null;
  error: string | null;
};

export type LocalResumableVerdict = {
  resumable: boolean;
  reason?: string;
  session_id?: string;
  workspace?: string;
  transcript_present?: boolean;
};

type RpcReply =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; error_type: string };

// ── The one shared bridge channel ───────────────────────────────────────────
//
// Replies are routed by requestId, so every in-flight RPC shares one channel
// instead of opening (and removing) its own. The manager arrives through the
// package's ambient door — this module is not a component.

type PendingReply = (envelope: LocalEnvelope) => void;

const pending = new Map<string, PendingReply>();

interface Bridge {
  userId: string;
  /** Resolves with the live handle once a manager exists and the channel is open. */
  handle: () => Promise<ChannelHandle>;
  stop: () => void;
}

let bridge: Bridge | null = null;

function bridgeSpec(userId: string): ChannelSpec {
  return {
    // The peer's topic, verbatim — see the file header.
    topic: matrxLocalChannel.topic({ userId }),
    // THE MATRX LOCAL APP OWNS THIS WIRE.
    wire: {
      mode: "raw",
      // Our own sends always carry this direction, so echo suppression is real
      // here rather than leaning on the server's `broadcast.self:false`.
      isOwnMessage: (payload) =>
        asLocalEnvelope(payload)?.direction === "frontend->local",
    },
    broadcast: [
      {
        event: BROADCAST_EVENT,
        onMessage: ({ data }) => {
          const envelope = asLocalEnvelope(data);
          if (envelope === null) {
            // Not silent: a payload that is not a v2 envelope means the
            // engine's shape drifted, and the remedy is a contract change.
            console.warn(
              "[Matrx Local] Dropped a payload that is not a v2 rpc envelope. " +
                "If the desktop app changed its wire shape, " +
                "cross_component_envelope.py and this module must change together.",
              data,
            );
            return;
          }
          const resolve = pending.get(envelope.requestId);
          if (resolve) resolve(envelope);
        },
      },
    ],
    // Raw wire has no `eid`, so this is what dedup keys on. A redelivered reply
    // is one message, not two — the hand-rolled version deduped nothing at all.
    eventKey: (_source, payload) => {
      const envelope = asLocalEnvelope(payload);
      return envelope === null
        ? undefined
        : `${envelope.direction}:${envelope.action}:${envelope.requestId}`;
    },
    // Request/reply with its own per-call timeouts: there is nothing to re-read
    // after a gap, and a caller whose reply was lost already learns about it.
    // Declared explicitly, with the reason — an omitted door is a warning about
    // a channel that has none.
    onBackfill: () => {
      // Intentionally nothing — see above.
    },
  };
}

function openBridge(userId: string): Bridge {
  if (bridge && bridge.userId === userId) return bridge;
  if (bridge) bridge.stop();

  let live: ChannelHandle | null = null;
  const waiters: Array<(handle: ChannelHandle) => void> = [];

  const detach = onRealtimeManagerChange((manager) => {
    if (live) {
      live.close();
      live = null;
    }
    if (!manager) return;
    live = manager.open(bridgeSpec(userId));
    while (waiters.length > 0) waiters.shift()?.(live);
  });

  const next: Bridge = {
    userId,
    handle: () =>
      live
        ? Promise.resolve(live)
        : new Promise<ChannelHandle>((resolve) => waiters.push(resolve)),
    stop: () => {
      detach();
      if (live) {
        live.close();
        live = null;
      }
    },
  };

  bridge = next;
  return next;
}

/**
 * One rpc round-trip to the user's Matrx Local engine over Supabase Broadcast.
 * Resolves the engine's reply payload, or throws with the real failure (engine
 * error text, or an explicit unreachable timeout).
 */
export async function callMatrxLocal<T>(
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to reach your Matrx Local app.");

  const requestId = crypto.randomUUID();
  const channel = await openBridge(user.id).handle();

  const reply = await new Promise<RpcReply>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(
        new Error(
          "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
        ),
      );
    }, timeoutMs);

    pending.set(requestId, (envelope) => {
      if (envelope.action !== `${action}.result`) return;
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(envelope.payload as RpcReply);
    });

    // Raw wire: this object goes on the wire verbatim, byte-identical to what
    // the hand-rolled `channel.send` put there.
    channel.send(BROADCAST_EVENT, {
      v: 2,
      kind: "rpc",
      direction: "frontend->local",
      action,
      requestId,
      payload,
      timestamp: Date.now(),
      fromInstance: { component: "frontend", instanceId: requestId },
      toInstance: { component: "local" },
    });
  });

  if (!reply.ok) {
    throw new Error(reply.error || "Matrx Local refused the request.");
  }
  return reply.data as T;
}

/** Truthful local-runtime capability — reachable, available, and why not. */
export async function readLocalRuntimeCapability(): Promise<LocalRuntimeCapability> {
  try {
    const data = await callMatrxLocal<{
      available: boolean;
      reasons: string[];
      claude_cli: string | null;
      claude_account_label: string | null;
      workspace_roots: string[];
      approved_folders: string[];
      active_runs: number;
    }>("coding_runtime.capabilities");
    return {
      state: "ready",
      available: data.available,
      reasons: data.reasons ?? [],
      claudeCli: data.claude_cli,
      claudeAccountLabel: data.claude_account_label,
      workspaceRoots: data.workspace_roots ?? [],
      approvedFolders: data.approved_folders ?? [],
      activeRuns: data.active_runs ?? 0,
    };
  } catch (capabilityError) {
    return {
      ...INITIAL_LOCAL_CAPABILITY,
      state: "unreachable",
      reasons: [
        capabilityError instanceof Error
          ? capabilityError.message
          : "Matrx Local is not reachable.",
      ],
    };
  }
}

/** Start (or natively resume) a Claude Code session on the user's Mac. */
export async function startLocalRuntimeSession(input: {
  workspace: string;
  prompt: string;
  resume_session_id?: string;
  model?: string;
  max_turns?: number;
}): Promise<LocalRuntimeRun> {
  // Starting a session takes a few seconds (the runtime waits for the
  // transcript + first mirror so it can answer with the conversation id).
  return callMatrxLocal<LocalRuntimeRun>("coding_runtime.start", input, 45_000);
}

/** Native-resume verdict from Claude's OWN local store on the user's Mac. */
export async function checkLocalResumable(
  providerSessionId: string,
): Promise<LocalResumableVerdict> {
  return callMatrxLocal<LocalResumableVerdict>("coding_runtime.resumable", {
    provider_session_id: providerSessionId,
  });
}
