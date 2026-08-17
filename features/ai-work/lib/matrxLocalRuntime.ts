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
 */

import { createClient } from "@/utils/supabase/client";

/** Matrx Local's per-user bridge channel (its engine subscribes to this). */
export function matrxLocalChannelName(userId: string): string {
  return `matrx-local-bridge:${userId}`;
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

/**
 * One rpc round-trip to the user's Matrx Local engine over Supabase
 * Broadcast. Resolves the engine's reply payload, or throws with the real
 * failure (engine error text, or an explicit unreachable timeout).
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
  const channel = supabase.channel(matrxLocalChannelName(user.id));

  try {
    const reply = await new Promise<RpcReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
          ),
        );
      }, timeoutMs);

      channel.on(
        "broadcast",
        { event: BROADCAST_EVENT },
        ({ payload: envelope }) => {
          if (
            !envelope ||
            envelope.requestId !== requestId ||
            envelope.action !== `${action}.result`
          ) {
            return;
          }
          clearTimeout(timer);
          resolve(envelope.payload as RpcReply);
        },
      );

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.send({
            type: "broadcast",
            event: BROADCAST_EVENT,
            payload: {
              v: 2,
              kind: "rpc",
              direction: "frontend->local",
              action,
              requestId,
              payload,
              timestamp: Date.now(),
              fromInstance: { component: "frontend", instanceId: requestId },
              toInstance: { component: "local" },
            },
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error("The realtime bridge channel could not be opened."));
        }
      });
    });

    if (!reply.ok) {
      throw new Error(reply.error || "Matrx Local refused the request.");
    }
    return reply.data as T;
  } finally {
    void supabase.removeChannel(channel);
  }
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
