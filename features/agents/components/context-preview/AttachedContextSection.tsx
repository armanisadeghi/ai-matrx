"use client";

/**
 * AttachedContextSection — the client-side half of the context preview,
 * itemized leg by leg so nothing the wire sends is hiding behind a blurb:
 *
 *   Always sent  → messages+instructions · attached resources (removable) ·
 *                  request variables · observational memory · client tools
 *   Active ctx   → org / scope / project / task layers (resolved server-side)
 *   This turn    → published context entries (removable)
 *
 * Every list reads the SAME slice `assembleRequest` reads
 * (`execute-instance.thunk.ts`), so this view matches the wire payload:
 * resources `selectInstanceResources` (payloads leg), variables
 * `selectVariablesForRequest`, memory `observational-memory` selectors,
 * tools `selectInstanceClientTools`, entries `selectInstanceContextEntries`
 * (= `selectContextPayload`).
 *
 * Removal reuses the composer's own actions — `removeResource`,
 * `removeContextEntry`, and the doc gates — never a parallel path.
 */

import { useMemo } from "react";
import {
  FileText,
  Lock,
  Braces,
  Type as TypeIcon,
  MessageSquareText,
  Paperclip,
  Brain,
  Wrench,
  Variable,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { removeContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  selectInstanceResources,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { removeResource } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { selectVariablesForRequest } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectInstanceClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.selectors";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryModelForConversation,
  selectMemoryScopeForConversation,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import { useActiveContextLayerItems } from "@/features/agents/components/context-items/useActiveContextLayerItems";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import type {
  InstanceContextEntry,
  ManagedResource,
} from "@/features/agents/types/instance.types";
import { cn } from "@/lib/utils";

/** Hover copy that stays visible on touch devices. */
const COPY_REVEAL =
  "opacity-0 transition-opacity pointer-coarse:opacity-100";

/** A human-readable preview string for any context value shape. */
function valuePreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.content === "string") return o.content;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
      {children}
    </div>
  );
}

function RemoveX({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label} from what is sent`}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground",
        "transition-colors hover:bg-destructive hover:text-destructive-foreground",
      )}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

// ── Resource rows (the wire's resourcePayloads leg) ──────────────────────────

/** Short human label for a resource: its blockType + best-effort source name. */
function resourceLabel(r: ManagedResource): string {
  const src = r.source;
  if (typeof src === "string") return src.slice(0, 80);
  if (src && typeof src === "object") {
    const o = src as Record<string, unknown>;
    for (const k of ["label", "title", "name", "filename", "url"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
  }
  return r.blockType;
}

interface SeenItem {
  key: string;
  icon: LucideIcon;
  title: string;
  kindLine: string;
  preview: string;
  chars: number;
  readOnly?: boolean;
  tone?: "primary" | "default";
  /** Detach this item from what is sent (composer's own action). */
  onRemove?: () => void;
}

export function AttachedContextSection({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  const selectEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const entries = useAppSelector(selectEntries);
  const layers = useActiveContextLayerItems(conversationId);

  const selectResources = useMemo(
    () => selectInstanceResources(conversationId),
    [conversationId],
  );
  const resources = useAppSelector(selectResources);
  const selectVars = useMemo(
    () => selectVariablesForRequest(conversationId),
    [conversationId],
  );
  const variables = useAppSelector(selectVars);
  const clientTools = useAppSelector(selectInstanceClientTools(conversationId));
  const memoryOn = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );
  const memoryModel = useAppSelector(
    selectMemoryModelForConversation(conversationId),
  );
  const memoryScope = useAppSelector(
    selectMemoryScopeForConversation(conversationId),
  );

  const variableKeys = Object.keys(variables);

  const describeEntry = (e: InstanceContextEntry): SeenItem => {
    const preview = valuePreview(e.value).trim();
    const title = e.label?.trim() || e.key;
    const base = { key: e.key, preview, chars: preview.length };
    const docKind = docKindForContextKey(e.key);
    if (docKind === "working") {
      return {
        ...base,
        icon: FileText,
        title: title || "Working document",
        kindLine:
          "The shared document — the agent reads it AND edits it each turn.",
        tone: "primary",
        onRemove: () =>
          void dispatch(
            setConversationDocumentEnabledThunk({
              conversationId,
              kind: "working",
              enabled: false,
            }),
          ),
      };
    }
    if (docKind === "scratch") {
      return {
        ...base,
        icon: Lock,
        title: title || "Scratchpad",
        kindLine:
          "Your private notes — the agent reads them but never edits them.",
        readOnly: true,
        onRemove: () =>
          void dispatch(
            setScratchpadGateThunk({ conversationId, enabled: false }),
          ),
      };
    }
    return {
      ...base,
      icon: e.slotMatched ? Braces : TypeIcon,
      title,
      kindLine: e.slotMatched
        ? "Fills one of this agent's declared context slots."
        : "Extra context you or the agent attached to this chat.",
      onRemove: () =>
        dispatch(removeContextEntry({ conversationId, key: e.key })),
    };
  };

  // Show EVERY published entry (matches the wire payload, which sends them
  // all — including empty ones); never silently drop something that is sent.
  const items = entries
    .map(describeEntry)
    .sort((a, b) => b.chars - a.chars);
  const totalChars = items.reduce((n, i) => n + i.chars, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-auto">
        {/* ── Always sent — itemized, never a blurb ── */}
        <SectionHead>Always sent</SectionHead>
        <ul className="divide-y divide-border/60">
          <li className="flex items-center gap-2 px-4 py-2">
            <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-sm text-foreground">
              Your messages + the agent&apos;s instructions
            </span>
          </li>

          {resources.map((r) => (
            <li key={r.resourceId} className="flex items-center gap-2 px-4 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {resourceLabel(r)}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  r.status === "ready"
                    ? "bg-primary/10 text-primary"
                    : r.status === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {r.blockType}
                {r.status !== "ready" ? ` · ${r.status}` : ""}
              </span>
              <RemoveX
                label={resourceLabel(r)}
                onRemove={() =>
                  dispatch(
                    removeResource({
                      conversationId,
                      resourceId: r.resourceId,
                    }),
                  )
                }
              />
            </li>
          ))}

          {variableKeys.length > 0 && (
            <li className="group/vars relative px-4 py-2">
              <div className="flex items-center gap-2">
                <Variable className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {variableKeys.length} variable
                  {variableKeys.length === 1 ? "" : "s"} this turn
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                {variableKeys.sort().map((k) => (
                  <span
                    key={k}
                    title={valuePreview(variables[k]).slice(0, 300)}
                    className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground/90"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <InlineCopyButton
                content={variables}
                size="xs"
                className={cn(COPY_REVEAL, "group-hover/vars:opacity-100")}
              />
            </li>
          )}

          {memoryOn && (
            <li className="flex items-center gap-2 px-4 py-2">
              <Brain className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm text-foreground">
                Observational memory
              </span>
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {[memoryModel, memoryScope].filter(Boolean).join(" · ") || "on"}
              </span>
            </li>
          )}

          {clientTools.length > 0 && (
            <li className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {clientTools.length} client tool
                  {clientTools.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                {clientTools.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground/90"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </li>
          )}
        </ul>

        {/* ── Active context layers — resolved server-side ── */}
        {layers.count > 0 && (
          <>
            <SectionHead>Your active context</SectionHead>
            <ul className="divide-y divide-border/60">
              {layers.items.map((layer) => {
                const Icon = layer.icon;
                return (
                  <li
                    key={layer.id}
                    className="flex items-center gap-2 px-4 py-2.5"
                  >
                    {Icon && (
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {layer.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {layer.typeLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-1.5 text-[11px] text-muted-foreground">
              Exact details: see the Resolved view.
            </div>
          </>
        )}

        {/* ── Published context entries ── */}
        {items.length > 0 && (
          <>
            <SectionHead>Also attached this turn</SectionHead>
            <ul className="divide-y divide-border/60">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key} className="group/entry relative px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          item.tone === "primary"
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {item.chars.toLocaleString()} chars
                      </span>
                      {item.onRemove && (
                        <RemoveX label={item.title} onRemove={item.onRemove} />
                      )}
                    </div>
                    <div className="mt-0.5 pl-6 text-xs text-muted-foreground">
                      {item.kindLine}
                    </div>
                    <div className="mt-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/90">
                      {item.preview ? (
                        <span className="line-clamp-4 whitespace-pre-wrap break-words">
                          {item.preview.slice(0, 600)}
                          {item.preview.length > 600 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground">
                          (empty — sent, but has no content yet)
                        </span>
                      )}
                    </div>
                    <InlineCopyButton
                      content={item.preview}
                      formatJson={false}
                      size="xs"
                      className={cn(COPY_REVEAL, "group-hover/entry:opacity-100")}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {items.length} attached item{items.length === 1 ? "" : "s"}
          </span>{" "}
          · ~{totalChars.toLocaleString()} characters of content
        </div>
      )}
    </div>
  );
}
