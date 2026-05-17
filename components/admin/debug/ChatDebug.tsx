// components/admin/debug/ChatDebug.tsx
// Live debug panel for the SSR chat route.
// Reads exclusively from Redux — no local state, no hooks, no fetch.
"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  selectActiveServerHealth,
  selectRecentApiCalls,
} from "@/lib/redux/slices/apiConfigSlice";
// Legacy chat debug panel — stubbed during Redux unification. Selectors
// return empty data; the panel still mounts but shows nothing for chat.
import type { RootState } from "@/lib/redux/store";

const EMPTY_MESSAGES: unknown[] = [];
const EMPTY_TOOL_CALLS: Record<string, unknown> = {};
const STUB_SELECTED_AGENT_TOOLS: string[] = [];
const STUB_SELECTED_AGENT = {
  promptId: "",
  name: "",
  tools: STUB_SELECTED_AGENT_TOOLS,
  configFetched: false,
};

const selectSession = (
  _state: RootState,
  _sessionId: string,
): Record<string, unknown> | undefined => undefined;
const selectMessages = (_state: RootState, _sessionId: string): unknown[] =>
  EMPTY_MESSAGES;
const selectUIState = (
  _state: RootState,
  _sessionId: string,
): Record<string, unknown> | undefined => undefined;
const selectIsStreaming = (_state: RootState, _sessionId: string): boolean =>
  false;
const selectAllToolCalls = (
  _state: RootState,
  _sessionId: string,
): Record<string, unknown> => EMPTY_TOOL_CALLS;
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// Pull sessionId from activeChatSlice — activeChat slice has been removed, stubbed here.
const selectSessionId = (_state: RootState): string | null => null;

const selectSelectedAgent = (
  _state: RootState,
): {
  promptId: string;
  name: string;
  tools?: string[];
  configFetched?: boolean;
} => STUB_SELECTED_AGENT;

const selectIsBlockMode = (_state: RootState): boolean => false;

function HealthDot({ status }: { status: string }) {
  if (status === "healthy")
    return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === "unhealthy")
    return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (status === "checking")
    return (
      <Loader2 className="h-3.5 w-3.5 text-yellow-500 shrink-0 animate-spin" />
    );
  return <AlertTriangle className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 w-36">{label}</span>
      <span
        className={`text-xs text-right truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function ChatDebug() {
  const sessionId = useAppSelector(selectSessionId);
  const selectedAgent = useAppSelector(selectSelectedAgent);
  const isBlockMode = useAppSelector(selectIsBlockMode);
  const activeServer = useAppSelector(selectActiveServer);
  const resolvedUrl = useAppSelector(selectResolvedBaseUrl);
  const serverHealth = useAppSelector(selectActiveServerHealth);
  const recentCalls = useAppSelector(selectRecentApiCalls);

  // Session-scoped state — guard with empty fallback when no session
  const session = useAppSelector((s) =>
    sessionId ? selectSession(s, sessionId) : undefined,
  );
  const messages = useAppSelector((s) =>
    sessionId ? selectMessages(s, sessionId) : EMPTY_MESSAGES,
  );
  const uiState = useAppSelector((s) =>
    sessionId ? selectUIState(s, sessionId) : null,
  );
  const isStreaming = useAppSelector((s) =>
    sessionId ? selectIsStreaming(s, sessionId) : false,
  );
  const toolCalls = useAppSelector((s) =>
    sessionId ? selectAllToolCalls(s, sessionId) : EMPTY_TOOL_CALLS,
  );

  const chatCalls = recentCalls.filter(
    (c) =>
      c.path.includes("/chat") ||
      c.path.includes("/message") ||
      c.path.includes("/stream"),
  );

  return (
    <div className="space-y-5 text-slate-100">
      {/* ── API Config ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          API Config
        </h3>
        <div className="bg-slate-900 rounded p-3 space-y-0.5">
          <Row
            label="Active Server"
            value={
              <Badge variant="outline" className="text-xs">
                {activeServer}
              </Badge>
            }
            mono={false}
          />
          <Row
            label="Backend URL"
            value={
              resolvedUrl ?? (
                <span className="text-red-400">not configured</span>
              )
            }
          />
          <Row
            label="Health"
            value={
              <div className="flex items-center gap-1.5">
                <HealthDot status={serverHealth.status} />
                <span>{serverHealth.status}</span>
                {serverHealth.latencyMs != null && (
                  <span className="text-slate-500">
                    ({serverHealth.latencyMs}ms)
                  </span>
                )}
              </div>
            }
            mono={false}
          />
          {serverHealth.error && (
            <Row
              label="Health Error"
              value={<span className="text-red-400">{serverHealth.error}</span>}
            />
          )}
          {serverHealth.lastCheckedAt && (
            <Row
              label="Last Checked"
              value={new Date(serverHealth.lastCheckedAt).toLocaleTimeString()}
            />
          )}
        </div>
      </section>

      {/* ── Active Agent ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Active Agent
        </h3>
        <div className="bg-slate-900 rounded p-3 space-y-0.5">
          <Row label="Name" value={selectedAgent.name || "—"} />
          <Row label="Prompt ID" value={selectedAgent.promptId || "—"} />
          <Row
            label="Config Fetched"
            value={String(selectedAgent.configFetched ?? false)}
          />
          <Row
            label="Tools"
            value={
              selectedAgent.tools?.length ? (
                selectedAgent.tools.join(", ")
              ) : (
                <span className="text-slate-500">none</span>
              )
            }
          />
          <Row label="Block Mode" value={String(isBlockMode)} />
        </div>
      </section>

      {/* ── Session ────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Session
        </h3>
        {!sessionId || !session ? (
          <div className="bg-slate-900 rounded p-3 text-xs text-slate-500 italic">
            No active session — welcome screen
          </div>
        ) : (
          <div className="bg-slate-900 rounded p-3 space-y-0.5">
            <Row label="Session ID" value={sessionId} />
            <Row
              label="Status"
              value={
                <span
                  className={
                    session.status === "streaming"
                      ? "text-blue-400"
                      : session.status === "error"
                        ? "text-red-400"
                        : session.status === "ready"
                          ? "text-green-400"
                          : "text-slate-300"
                  }
                >
                  {String(session.status ?? "")}
                  {isStreaming && (
                    <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />
                  )}
                </span>
              }
              mono={false}
            />
            <Row
              label="Conversation ID"
              value={
                session.conversationId ? (
                  String(session.conversationId)
                ) : (
                  <span className="text-slate-500">not yet persisted</span>
                )
              }
            />
            <Row label="Agent ID" value={String(session.agentId ?? "")} />
            <Row label="API Mode" value={String(session.apiMode ?? "")} />
            <Row label="Messages" value={String(messages.length)} />
            <Row
              label="Tool Calls"
              value={String(Object.keys(toolCalls).length)}
            />
            <Row
              label="Show Debug Info"
              value={String(uiState?.showDebugInfo ?? false)}
            />
            <Row
              label="Model Override"
              value={
                uiState?.modelOverride ? (
                  String(uiState.modelOverride)
                ) : (
                  <span className="text-slate-500">none</span>
                )
              }
            />
            {session.error != null && (
              <Row
                label="Error"
                value={
                  <span className="text-red-400">{String(session.error)}</span>
                }
              />
            )}
          </div>
        )}
      </section>

      {/* ── Recent Chat API Calls ──────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Recent Chat API Calls ({chatCalls.length})
        </h3>
        {chatCalls.length === 0 ? (
          <div className="bg-slate-900 rounded p-3 text-xs text-slate-500 italic">
            No chat API calls logged yet
          </div>
        ) : (
          <ScrollArea className="h-48">
            <div className="bg-slate-900 rounded p-2 space-y-1">
              {chatCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded bg-slate-800"
                >
                  <span
                    className={
                      call.status === "success"
                        ? "text-green-400"
                        : call.status === "error"
                          ? "text-red-400"
                          : "text-yellow-400"
                    }
                  >
                    {call.status === "success"
                      ? "✓"
                      : call.status === "error"
                        ? "✗"
                        : "…"}
                  </span>
                  <span className="text-slate-400 w-12 shrink-0">
                    {call.method}
                  </span>
                  <span className="flex-1 truncate text-slate-200">
                    {call.path}
                  </span>
                  {call.durationMs != null && (
                    <span className="text-slate-500 shrink-0">
                      {call.durationMs}ms
                    </span>
                  )}
                  {call.httpStatus != null && (
                    <span
                      className={`shrink-0 ${call.httpStatus < 400 ? "text-slate-400" : "text-red-400"}`}
                    >
                      {call.httpStatus}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}
