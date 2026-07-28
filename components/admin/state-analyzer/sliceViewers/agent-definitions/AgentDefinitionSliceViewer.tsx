"use client";

import React from "react";
import type { AgentDefinitionSliceState } from "@/features/agents/types/agent-definition.types";
import {
  safeFormat,
  setToSortedArray,
  useAgentDefinitionSliceViewModel,
} from "./agent-definition-slice-viewer-model";

function CompactPre({ children }: { children: string }) {
  return (
    <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-all border-l border-border pl-1 text-[11px] leading-snug text-foreground">
      {children}
    </pre>
  );
}

function KvRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
      <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
      <div className="min-w-0 text-[11px] text-foreground">{children}</div>
    </div>
  );
}

function MiniTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) {
    return <div className="text-[11px] text-muted-foreground">—</div>;
  }
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="border border-border px-1 py-0 text-left font-normal text-muted-foreground"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, ri) => (
          <tr key={ri}>
            {cells.map((c, ci) => (
              <td key={ci} className="border border-border px-1 py-0 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AgentDefinitionSliceViewer({
  state,
}: {
  state: AgentDefinitionSliceState | undefined;
}) {
  const {
    agents,
    ids,
    activeAgentId,
    state: sliceState,
    setSelectedId,
    resolvedId,
    record,
    messages,
    msgIdx,
    setMsgIdx,
    safeMsgIdx,
    selectedMessage,
    variableDefs,
    varRowData,
    slotRows,
    toolRowData,
  } = useAgentDefinitionSliceViewModel(state);

  const varRows = varRowData.map((v) => [
    v.name,
    <CompactPre key={`d-${v.name}`}>{v.defaultFormatted}</CompactPre>,
    v.required,
    v.helpText,
    <CompactPre key={`c-${v.name}`}>
      {v.customComponentFormatted ?? "—"}
    </CompactPre>,
  ]);

  const toolRows = toolRowData.map((t) => [
    t.name,
    t.description,
    <CompactPre key={`sch-${t.name}`}>
      {t.inputSchemaFormatted ?? "—"}
    </CompactPre>,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-xs">
      <div className="shrink-0 border-b border-border px-1 py-0.5">
        <div className="mb-0.5 text-[11px] font-semibold text-muted-foreground">
          agentDefinition
        </div>
        <KvRow label="activeAgentId">{activeAgentId ?? "null"}</KvRow>
        <KvRow label="status">{sliceState?.status ?? "—"}</KvRow>
        <KvRow label="error">{sliceState?.error ?? "null"}</KvRow>
        <KvRow label="agents.length">{String(ids.length)}</KvRow>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1 py-0.5">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          record
        </span>
        <select
          className="h-6 min-w-0 flex-1 border border-border bg-background px-1 text-[11px] text-foreground"
          value={resolvedId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedId(v === "" ? null : v);
          }}
        >
          {ids.length === 0 ? (
            <option value="">(no agents)</option>
          ) : (
            ids.map((id) => {
              const r = agents[id];
              const label = `${id}${r?.name ? ` | ${r.name}` : ""}${r?.isVersion ? " [ver]" : ""}`;
              return (
                <option key={id} value={id}>
                  {label}
                </option>
              );
            })
          )}
        </select>
      </div>

      {!record ? (
        <div className="flex-1 overflow-auto p-1 text-[11px] text-muted-foreground">
          No record selected.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-1 pt-0.5">
          <div className="space-y-1">
            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                identity
              </div>
              <KvRow label="id">{record.id}</KvRow>
              <KvRow label="name">{record.name}</KvRow>
              <KvRow label="description">{record.description ?? "null"}</KvRow>
              <KvRow label="category">{record.category ?? "null"}</KvRow>
              <KvRow label="tags">{record.tags.join(", ") || "—"}</KvRow>
              <KvRow label="agentType">{record.agentType}</KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                version
              </div>
              <KvRow label="isVersion">{String(record.isVersion)}</KvRow>
              <KvRow label="parentAgentId">
                {record.parentAgentId ?? "null"}
              </KvRow>
              <KvRow label="version">
                {record.version != null
                  ? String(record.version)
                  : "null"}
              </KvRow>
              <KvRow label="changedAt">{record.changedAt ?? "null"}</KvRow>
              <KvRow label="changeNote">{record.changeNote ?? "null"}</KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                flags
              </div>
              <KvRow label="isActive">{String(record.isActive)}</KvRow>
              <KvRow label="isPublic">{String(record.isPublic)}</KvRow>
              <KvRow label="isArchived">{String(record.isArchived)}</KvRow>
              <KvRow label="isFavorite">{String(record.isFavorite)}</KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                model / tools
              </div>
              <KvRow label="modelId">{record.modelId ?? "null"}</KvRow>
              <KvRow label="tools">
                {record.tools.length ? record.tools.join(", ") : "—"}
              </KvRow>
              <KvRow label="tools.length">{String(record.tools.length)}</KvRow>
              <KvRow label="mcpServers">
                {record.mcpServers.length ? record.mcpServers.join(", ") : "—"}
              </KvRow>
              <KvRow label="mcpServers.length">
                {String(record.mcpServers.length)}
              </KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                messages
              </div>
              {messages.length === 0 ? (
                <KvRow label="messages">[]</KvRow>
              ) : (
                <>
                  <div className="flex items-center gap-1 py-px">
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      index
                    </span>
                    <select
                      className="h-6 flex-1 border border-border bg-background px-1 text-[11px]"
                      value={String(safeMsgIdx)}
                      onChange={(e) => setMsgIdx(Number(e.target.value))}
                    >
                      {messages.map((m, i) => (
                        <option key={i} value={String(i)}>
                          [{i}] {m.role}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      n={messages.length}
                    </span>
                  </div>
                  {selectedMessage ? (
                    <CompactPre>{safeFormat(selectedMessage)}</CompactPre>
                  ) : null}
                </>
              )}
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                variableDefinitions
              </div>
              {variableDefs === null ? (
                <KvRow label="value">null</KvRow>
              ) : (
                <MiniTable
                  headers={[
                    "name",
                    "default",
                    "req",
                    "help",
                    "customComponent",
                  ]}
                  rows={varRows}
                />
              )}
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                settings (LLMParams)
              </div>
              <CompactPre>{safeFormat(record.settings)}</CompactPre>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                contextSlots
              </div>
              <MiniTable
                headers={[
                  "key",
                  "type",
                  "label",
                  "desc",
                  "max_inline",
                  "summary_agent",
                ]}
                rows={slotRows}
              />
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                modelTiers
              </div>
              <KvRow label="value">
                {record.modelTiers === null ? (
                  "null"
                ) : (
                  <CompactPre>{safeFormat(record.modelTiers)}</CompactPre>
                )}
              </KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                outputSchema
              </div>
              <KvRow label="value">
                {record.outputSchema === null ? (
                  "null"
                ) : (
                  <CompactPre>{safeFormat(record.outputSchema)}</CompactPre>
                )}
              </KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                customTools
              </div>
              <MiniTable
                headers={["name", "description", "input_schema"]}
                rows={toolRows}
              />
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                ownership
              </div>
              <KvRow label="userId">{record.userId ?? "null"}</KvRow>
              <KvRow label="organizationId">
                {record.organizationId ?? "null"}
              </KvRow>
              <KvRow label="taskId">{record.taskId ?? "null"}</KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                lineage
              </div>
              <KvRow label="sourceAgentId">
                {record.sourceAgentId ?? "null"}
              </KvRow>
              <KvRow label="sourceSnapshotAt">
                {record.sourceSnapshotAt ?? "null"}
              </KvRow>
              <KvRow label="createdAt">{record.createdAt}</KvRow>
              <KvRow label="updatedAt">{record.updatedAt}</KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                access
              </div>
              <KvRow label="isOwner">
                {record.isOwner === null ? "null" : String(record.isOwner)}
              </KvRow>
              <KvRow label="accessLevel">{record.accessLevel ?? "null"}</KvRow>
              <KvRow label="sharedByEmail">
                {record.sharedByEmail ?? "null"}
              </KvRow>
            </section>

            <section className="space-y-px">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                runtime (slice)
              </div>
              <KvRow label="_dirty">{String(record._dirty)}</KvRow>
              <KvRow label="_fetchStatus">
                {record._fetchStatus ?? "null"}
              </KvRow>
              <KvRow label="_loading">{String(record._loading)}</KvRow>
              <KvRow label="_error">{record._error ?? "null"}</KvRow>
              <KvRow label="_dirtyFields">
                {setToSortedArray(record._dirtyFields).join(", ") || "—"}
              </KvRow>
              <KvRow label="_loadedFields">
                {setToSortedArray(record._loadedFields).join(", ") || "—"}
              </KvRow>
              <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
                <div className="text-[11px] text-muted-foreground">
                  _fieldHistory
                </div>
                <CompactPre>{safeFormat(record._fieldHistory)}</CompactPre>
              </div>
              <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
                <div className="text-[11px] text-muted-foreground">
                  _undoPast
                </div>
                <CompactPre>{safeFormat(record._undoPast)}</CompactPre>
              </div>
              <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
                <div className="text-[11px] text-muted-foreground">
                  _undoFuture
                </div>
                <CompactPre>{safeFormat(record._undoFuture)}</CompactPre>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
