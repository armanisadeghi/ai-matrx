"use client";

import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
// Legacy CX canonical panel — stubbed during Redux unification.
import type { RootState } from "@/lib/redux/store";
const selectAgentId = (_state: RootState, _sessionId: string): string | null =>
  null;
const selectConversationId = (
  _state: RootState,
  _sessionId: string,
): string | null => null;
const selectProtocolCanonicalMessages = (
  _state: RootState,
  _sessionId: string,
): unknown[] => [];
const selectProtocolDbMessages = (
  _state: RootState,
  _sessionId: string,
): unknown[] => [];
const selectProtocolDbToolCalls = (
  _state: RootState,
  _sessionId: string,
): unknown[] => [];
const selectSessionError = (
  _state: RootState,
  _sessionId: string,
): string | null => null;
const selectSessionStatus = (_state: RootState, _sessionId: string): string =>
  "idle";

const JSON_MAX = 12000;

function reduxJson(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    const s = JSON.stringify(value, null, 2);
    if (s === undefined) return String(value);
    if (s.length <= JSON_MAX) return s;
    return `${s.slice(0, JSON_MAX)}\n… (${s.length - JSON_MAX} more chars)`;
  } catch {
    return String(value);
  }
}

function BlockLabel({ selector }: { selector: string }) {
  return (
    <p className="text-[9px] font-mono text-muted-foreground shrink-0 px-0.5">
      chatConversations | {selector}
    </p>
  );
}

interface AgentCanonicalDbPanelProps {
  sessionId: string;
}

export function AgentCanonicalDbPanel({
  sessionId,
}: AgentCanonicalDbPanelProps) {
  const sessionStatus = useAppSelector((s) =>
    selectSessionStatus(s, sessionId),
  );
  const sessionError = useAppSelector((s) => selectSessionError(s, sessionId));
  const conversationId = useAppSelector((s) =>
    selectConversationId(s, sessionId),
  );
  const agentId = useAppSelector((s) => selectAgentId(s, sessionId));
  const protocolMessages = useAppSelector((s) =>
    selectProtocolDbMessages(s, sessionId),
  );
  const protocolToolCalls = useAppSelector((s) =>
    selectProtocolDbToolCalls(s, sessionId),
  );
  const canonicalFromDb = useAppSelector((s) =>
    selectProtocolCanonicalMessages(s, sessionId),
  );

  const convDisplay =
    conversationId === null || conversationId === ""
      ? "—"
      : String(conversationId);
  const agentDisplay =
    agentId === null || agentId === "" ? "—" : String(agentId);

  return (
    <div className="min-h-0 h-full flex flex-col overflow-hidden border-l border-border">
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden p-2 border border-dashed border-border bg-muted/15 rounded gap-2">
        <p className="text-[9px] font-mono font-semibold text-foreground/80 shrink-0">
          state.chatConversations
        </p>

        <table className="w-full shrink-0 border-collapse border border-border text-[9px] font-mono">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="border border-border px-1 py-0.5 text-left font-normal">
                selectSessionStatus
              </th>
              <th className="border border-border px-1 py-0.5 text-left font-normal">
                selectConversationId
              </th>
              <th className="border border-border px-1 py-0.5 text-left font-normal">
                selectAgentId
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-foreground">
              <td className="border border-border px-1 py-0.5 align-top whitespace-nowrap">
                {sessionStatus}
                {sessionStatus === "initializing" ? (
                  <Loader2 className="inline h-3 w-3 animate-spin ml-0.5 align-middle" />
                ) : null}
              </td>
              <td className="border border-border px-1 py-0.5 align-top break-all">
                {convDisplay}
              </td>
              <td className="border border-border px-1 py-0.5 align-top break-all">
                {agentDisplay}
              </td>
            </tr>
          </tbody>
        </table>

        {sessionStatus === "error" && sessionError ? (
          <p className="text-[9px] font-mono text-destructive shrink-0 break-all px-0.5">
            selectSessionError | {sessionError}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 flex flex-col gap-2 overflow-hidden">
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden border border-border rounded bg-muted/20">
            <BlockLabel selector="selectProtocolDbMessages" />
            <pre className="min-h-0 flex-1 overflow-y-auto p-1.5 text-[9px] font-mono leading-snug whitespace-pre-wrap break-all text-foreground/90">
              {reduxJson(protocolMessages)}
            </pre>
          </div>
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden border border-border rounded bg-muted/20">
            <BlockLabel selector="selectProtocolDbToolCalls" />
            <pre className="min-h-0 flex-1 overflow-y-auto p-1.5 text-[9px] font-mono leading-snug whitespace-pre-wrap break-all text-foreground/90">
              {reduxJson(protocolToolCalls)}
            </pre>
          </div>
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden border border-border rounded bg-muted/20">
            <BlockLabel selector="selectProtocolCanonicalMessages" />
            <pre className="min-h-0 flex-1 overflow-y-auto p-1.5 text-[9px] font-mono leading-snug whitespace-pre-wrap break-all text-foreground/90">
              {reduxJson(canonicalFromDb)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
