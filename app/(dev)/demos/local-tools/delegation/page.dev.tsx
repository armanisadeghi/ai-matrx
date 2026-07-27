"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw, Wrench } from "lucide-react";
import { LocalToolsPageShell } from "../_lib/LocalToolsPageShell";
import { useMatrxLocalContext } from "../_lib/MatrxLocalContext";

interface CallState {
  loading: boolean;
  result: unknown;
  error: string | null;
}

const idleCall: CallState = {
  loading: false,
  result: null,
  error: null,
};

export default function ToolDelegationTestPage() {
  const local = useMatrxLocalContext();
  const [agentId, setAgentId] = useState("");
  const [surface, setSurface] = useState("matrx-user/chat");
  const [toolName, setToolName] = useState("SystemInfo");
  const [toolArgs, setToolArgs] = useState("{}");
  const [addedToolIds, setAddedToolIds] = useState("");
  const [resolveState, setResolveState] = useState<CallState>(idleCall);
  const [executeState, setExecuteState] = useState<CallState>(idleCall);

  const addedToolIdList = useMemo(
    () =>
      addedToolIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [addedToolIds],
  );

  const resolveBody = useMemo(
    () => ({
      surface,
      added_tool_ids: addedToolIdList,
      is_version: false,
      client: { surface },
    }),
    [addedToolIdList, surface],
  );

  const executeBody = useMemo(() => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(toolArgs);
    } catch {
      parsedArgs = {};
    }
    return {
      agent_id: agentId,
      tool_name: toolName,
      arguments: parsedArgs,
      surface,
      call_id: "local-tools-preview",
      added_tool_ids: addedToolIdList,
      is_version: false,
    };
  }, [addedToolIdList, agentId, surface, toolArgs, toolName]);

  const resolveTools = async () => {
    if (!agentId.trim()) {
      setResolveState({
        loading: false,
        result: null,
        error: "Agent ID is required",
      });
      return;
    }
    setResolveState({ ...idleCall, loading: true });
    try {
      const result = await local.restPost(
        `/ai/agents/${encodeURIComponent(agentId.trim())}/realtime-tools`,
        resolveBody,
      );
      setResolveState({ loading: false, result, error: null });
    } catch (err) {
      setResolveState({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : "Failed to resolve tools",
      });
    }
  };

  const executeTool = async () => {
    if (!agentId.trim()) {
      setExecuteState({
        loading: false,
        result: null,
        error: "Agent ID is required",
      });
      return;
    }
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolArgs);
    } catch (err) {
      setExecuteState({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : "Arguments must be JSON",
      });
      return;
    }

    setExecuteState({ ...idleCall, loading: true });
    try {
      const result = await local.restPost("/ai/tools/execute", {
        ...executeBody,
        call_id: `local-tools-${Date.now()}`,
        arguments: parsedArgs,
      });
      setExecuteState({ loading: false, result, error: null });
    } catch (err) {
      setExecuteState({
        loading: false,
        result: null,
        error: err instanceof Error ? err.message : "Tool execution failed",
      });
    }
  };

  return (
    <LocalToolsPageShell>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div className="max-w-screen-2xl mx-auto grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-3">
          <section className="border rounded-lg bg-card p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Delegation Inputs</h2>
            </div>

            <Field label="Agent ID">
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-8 rounded border bg-background px-2 text-xs font-mono"
                spellCheck={false}
              />
            </Field>

            <Field label="Surface">
              <input
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="w-full h-8 rounded border bg-background px-2 text-xs font-mono"
                spellCheck={false}
              />
            </Field>

            <Field label="Added Tool IDs">
              <input
                value={addedToolIds}
                onChange={(e) => setAddedToolIds(e.target.value)}
                className="w-full h-8 rounded border bg-background px-2 text-xs font-mono"
                spellCheck={false}
              />
            </Field>

            <Field label="Tool Name">
              <input
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                className="w-full h-8 rounded border bg-background px-2 text-xs font-mono"
                spellCheck={false}
              />
            </Field>

            <Field label="Arguments JSON">
              <textarea
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full h-32 rounded border bg-background p-2 text-xs font-mono"
                spellCheck={false}
              />
            </Field>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DiagnosticCall
              title="Resolve Realtime Tools"
              badge={`POST /ai/agents/{agent_id}/realtime-tools`}
              body={resolveBody}
              state={resolveState}
              onRun={resolveTools}
              icon="resolve"
            />
            <DiagnosticCall
              title="Execute Delegated Tool"
              badge="POST /ai/tools/execute"
              body={executeBody}
              state={executeState}
              onRun={executeTool}
              icon="execute"
            />
          </section>
        </div>
      </div>
    </LocalToolsPageShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function DiagnosticCall({
  title,
  badge,
  body,
  state,
  onRun,
  icon,
}: {
  title: string;
  badge: string;
  body: unknown;
  state: CallState;
  onRun: () => void;
  icon: "resolve" | "execute";
}) {
  return (
    <div className="border rounded-lg bg-card p-3 space-y-3 min-h-[520px]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon === "resolve" ? (
              <RefreshCw className="w-4 h-4 text-primary" />
            ) : (
              <Play className="w-4 h-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold truncate">{title}</h3>
          </div>
          <Badge variant="secondary" className="h-5 text-[10px] mt-2">
            {badge}
          </Badge>
        </div>
        <Button
          size="sm"
          onClick={onRun}
          disabled={state.loading}
          className="h-8 gap-1.5 shrink-0"
        >
          {state.loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Run
        </Button>
      </div>

      <div className="rounded border bg-background p-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Request
        </div>
        <pre className="text-[10px] whitespace-pre-wrap break-words">
          {JSON.stringify(body, null, 2)}
        </pre>
      </div>

      <div className="rounded border bg-background p-2 min-h-52">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Response
          </span>
          {state.error ? (
            <Badge variant="destructive" className="h-5 text-[10px]">
              error
            </Badge>
          ) : null}
        </div>
        <pre className="text-xs whitespace-pre-wrap break-words">
          {state.error ?? JSON.stringify(state.result ?? null, null, 2)}
        </pre>
      </div>
    </div>
  );
}
