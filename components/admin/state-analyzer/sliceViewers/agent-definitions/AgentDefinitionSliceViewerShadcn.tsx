"use client";

import React from "react";
import type { AgentDefinitionSliceState } from "@/features/agents/types/agent-definition.types";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/styles/themes/utils";
import {
  safeFormat,
  setToSortedArray,
  useAgentDefinitionSliceViewModel,
} from "./agent-definition-slice-viewer-model";
import {
  AiModelRef,
  AiToolRef,
} from "@/components/official/entity-ref/AiIdentityRef";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function CompactPre({ children }: { children: string }) {
  return (
    <pre
      className={cn(
        "m-0 max-h-56 whitespace-pre-wrap break-all border-l border-border pl-1 font-mono text-[11px] leading-snug text-foreground",
      )}
    >
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
      <Label className="shrink-0 text-[11px] font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0 text-[11px] text-foreground">{children}</div>
    </div>
  );
}

const tableHeadClass =
  "h-7 px-1 py-0 text-left align-middle text-[11px] font-normal text-muted-foreground";
const tableCellClass = "p-1 py-0.5 align-top text-[11px]";

export default function AgentDefinitionSliceViewerShadcn({
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
    setMsgIdx,
    safeMsgIdx,
    selectedMessage,
    variableDefs,
    varRowData,
    slotRows,
    toolRowData,
  } = useAgentDefinitionSliceViewModel(state);

  const recordSelect =
    ids.length === 0 ? (
      <span className="text-[11px] text-muted-foreground">(no agents)</span>
    ) : (
      <Select
        value={resolvedId ?? ids[0]}
        onValueChange={(v) => setSelectedId(v)}
      >
        <SelectTrigger size="sm" className="h-7 min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ids.map((id) => {
            const r = agents[id];
            const label = `${id}${r?.name ? ` | ${r.name}` : ""}${r?.isVersion ? " [ver]" : ""}`;
            return (
              <SelectItem key={id} value={id} className="text-xs">
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );

  const msgSelect =
    messages.length === 0 ? null : (
      <div className="flex items-center gap-1 py-px">
        <Label className="w-10 shrink-0 text-[11px] font-normal text-muted-foreground">
          index
        </Label>
        <Select
          value={String(safeMsgIdx)}
          onValueChange={(v) => setMsgIdx(Number(v))}
        >
          <SelectTrigger size="sm" className="h-7 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {messages.map((m, i) => (
              <SelectItem key={i} value={String(i)} className="text-xs">
                [{i}] {m.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          n={messages.length}
        </span>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-xs">
      <div className="shrink-0 space-y-0.5 border-b border-border px-1 py-0.5">
        <div className="text-[11px] font-semibold text-muted-foreground">
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
        {recordSelect}
      </div>

      {!record ? (
        <div className="flex-1 p-1 text-[11px] text-muted-foreground">
          No record selected.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-0 px-1 pb-1 pt-0.5 pr-2">
              <SectionTitle>identity</SectionTitle>
              <KvRow label="id">{record.id}</KvRow>
              <KvRow label="name">{record.name}</KvRow>
              <KvRow label="description">{record.description ?? "null"}</KvRow>
              <KvRow label="category">{record.category ?? "null"}</KvRow>
              <KvRow label="tags">{record.tags.join(", ") || "—"}</KvRow>
              <KvRow label="agentType">{record.agentType}</KvRow>

              <Separator className="my-1" />
              <SectionTitle>version</SectionTitle>
              <KvRow label="isVersion">{String(record.isVersion)}</KvRow>
              <KvRow label="parentAgentId">
                {record.parentAgentId ?? "null"}
              </KvRow>
              <KvRow label="version">
                {record.version != null ? String(record.version) : "null"}
              </KvRow>
              <KvRow label="changedAt">{record.changedAt ?? "null"}</KvRow>
              <KvRow label="changeNote">{record.changeNote ?? "null"}</KvRow>

              <Separator className="my-1" />
              <SectionTitle>flags</SectionTitle>
              <KvRow label="isActive">{String(record.isActive)}</KvRow>
              <KvRow label="isPublic">{String(record.isPublic)}</KvRow>
              <KvRow label="isArchived">{String(record.isArchived)}</KvRow>
              <KvRow label="isFavorite">{String(record.isFavorite)}</KvRow>

              <Separator className="my-1" />
              <SectionTitle>model / tools</SectionTitle>
              <KvRow label="model">
                {record.modelId ? (
                  <AiModelRef modelId={record.modelId} showId />
                ) : (
                  "null"
                )}
              </KvRow>
              <KvRow label="tools">
                {record.tools.length ? (
                  <span className="flex flex-col gap-1">
                    {record.tools.map((toolId) => (
                      <AiToolRef key={toolId} toolId={toolId} showId />
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </KvRow>
              <KvRow label="tools.length">{String(record.tools.length)}</KvRow>
              <KvRow label="mcpServers">
                {record.mcpServers.length ? record.mcpServers.join(", ") : "—"}
              </KvRow>
              <KvRow label="mcpServers.length">
                {String(record.mcpServers.length)}
              </KvRow>

              <Separator className="my-1" />
              <SectionTitle>messages</SectionTitle>
              {messages.length === 0 ? (
                <KvRow label="messages">[]</KvRow>
              ) : (
                <>
                  {msgSelect}
                  {selectedMessage ? (
                    <CompactPre>{safeFormat(selectedMessage)}</CompactPre>
                  ) : null}
                </>
              )}

              <Separator className="my-1" />
              <SectionTitle>variableDefinitions</SectionTitle>
              {variableDefs === null ? (
                <KvRow label="value">null</KvRow>
              ) : varRowData.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">—</div>
              ) : (
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeadClass}>name</TableHead>
                      <TableHead className={tableHeadClass}>default</TableHead>
                      <TableHead className={tableHeadClass}>req</TableHead>
                      <TableHead className={tableHeadClass}>help</TableHead>
                      <TableHead className={tableHeadClass}>
                        customComponent
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {varRowData.map((v) => (
                      <TableRow key={v.name} className="hover:bg-muted/30">
                        <TableCell className={tableCellClass}>
                          {v.name}
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          <CompactPre>{v.defaultFormatted}</CompactPre>
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          {v.required}
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          {v.helpText}
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          <CompactPre>
                            {v.customComponentFormatted ?? "—"}
                          </CompactPre>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator className="my-1" />
              <SectionTitle>settings (LLMParams)</SectionTitle>
              <CompactPre>{safeFormat(record.settings)}</CompactPre>

              <Separator className="my-1" />
              <SectionTitle>contextSlots</SectionTitle>
              {slotRows.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">—</div>
              ) : (
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeadClass}>key</TableHead>
                      <TableHead className={tableHeadClass}>type</TableHead>
                      <TableHead className={tableHeadClass}>label</TableHead>
                      <TableHead className={tableHeadClass}>desc</TableHead>
                      <TableHead className={tableHeadClass}>
                        max_inline
                      </TableHead>
                      <TableHead className={tableHeadClass}>
                        summary_agent
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slotRows.map((cells, ri) => (
                      <TableRow key={ri} className="hover:bg-muted/30">
                        {cells.map((c, ci) => (
                          <TableCell key={ci} className={tableCellClass}>
                            {c}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator className="my-1" />
              <SectionTitle>modelTiers</SectionTitle>
              <KvRow label="value">
                {record.modelTiers === null ? (
                  "null"
                ) : (
                  <CompactPre>{safeFormat(record.modelTiers)}</CompactPre>
                )}
              </KvRow>

              <Separator className="my-1" />
              <SectionTitle>outputSchema</SectionTitle>
              <KvRow label="value">
                {record.outputSchema === null ? (
                  "null"
                ) : (
                  <CompactPre>{safeFormat(record.outputSchema)}</CompactPre>
                )}
              </KvRow>

              <Separator className="my-1" />
              <SectionTitle>customTools</SectionTitle>
              {toolRowData.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">—</div>
              ) : (
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeadClass}>name</TableHead>
                      <TableHead className={tableHeadClass}>
                        description
                      </TableHead>
                      <TableHead className={tableHeadClass}>
                        input_schema
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {toolRowData.map((t) => (
                      <TableRow key={t.name} className="hover:bg-muted/30">
                        <TableCell className={tableCellClass}>
                          {t.name}
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          {t.description}
                        </TableCell>
                        <TableCell className={tableCellClass}>
                          <CompactPre>
                            {t.inputSchemaFormatted ?? "—"}
                          </CompactPre>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator className="my-1" />
              <SectionTitle>ownership</SectionTitle>
              <KvRow label="userId">{record.userId ?? "null"}</KvRow>
              <KvRow label="organizationId">
                {record.organizationId ?? "null"}
              </KvRow>
              <KvRow label="taskId">{record.taskId ?? "null"}</KvRow>

              <Separator className="my-1" />
              <SectionTitle>lineage</SectionTitle>
              <KvRow label="sourceAgentId">
                {record.sourceAgentId ?? "null"}
              </KvRow>
              <KvRow label="sourceSnapshotAt">
                {record.sourceSnapshotAt ?? "null"}
              </KvRow>
              <KvRow label="createdAt">{record.createdAt}</KvRow>
              <KvRow label="updatedAt">{record.updatedAt}</KvRow>

              <Separator className="my-1" />
              <SectionTitle>access</SectionTitle>
              <KvRow label="isOwner">
                {record.isOwner === null ? "null" : String(record.isOwner)}
              </KvRow>
              <KvRow label="accessLevel">{record.accessLevel ?? "null"}</KvRow>
              <KvRow label="sharedByEmail">
                {record.sharedByEmail ?? "null"}
              </KvRow>

              <Separator className="my-1" />
              <SectionTitle>runtime (slice)</SectionTitle>
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
                <Label className="text-[11px] font-normal text-muted-foreground">
                  _fieldHistory
                </Label>
                <CompactPre>{safeFormat(record._fieldHistory)}</CompactPre>
              </div>
              <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
                <Label className="text-[11px] font-normal text-muted-foreground">
                  _undoPast
                </Label>
                <CompactPre>{safeFormat(record._undoPast)}</CompactPre>
              </div>
              <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] gap-x-2 border-b border-border/50 py-px">
                <Label className="text-[11px] font-normal text-muted-foreground">
                  _undoFuture
                </Label>
                <CompactPre>{safeFormat(record._undoFuture)}</CompactPre>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
