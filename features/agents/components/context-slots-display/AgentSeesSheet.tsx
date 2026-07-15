"use client";

/**
 * AgentSeesSheet — the plain-language "what the model actually receives this
 * turn" view.
 *
 * The context system is powerful but opaque: the rail shows one-word pills, and
 * a user can't tell what they've ATTACHED to the model vs. what they haven't.
 * This sheet answers that. It reads the SAME slice the request payload is built
 * from (`selectInstanceContextEntries` — identical to `selectContextPayload`)
 * plus the active scope layers, and renders each piece in human terms: what it
 * is, whether the agent can edit it, a preview of the value, and its size.
 *
 * SCOPE (deliberately honest, not overclaimed): this shows the CONTEXT ATTACHED
 * to the chat — documents, scopes, and context items. It is NOT the full raw
 * model payload: files you attach, the agent's tools + instructions, and its
 * saved memory are ALSO sent every turn (noted as the baseline), and a few
 * server-side unions (personal-org fallback, conversation-tagged scopes) resolve
 * behind the scenes. Never tell the user "nothing else is sent."
 *
 * Read-only + additive: it does not change what's sent, only makes it legible.
 */

import { useMemo } from "react";
import {
  Eye,
  FileText,
  Lock,
  Layers,
  Braces,
  Type as TypeIcon,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { useActiveContextLayerItems } from "@/features/agents/components/context-items/useActiveContextLayerItems";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { cn } from "@/lib/utils";

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

interface SeenItem {
  key: string;
  icon: LucideIcon;
  title: string;
  /** One plain sentence: what this is + whether the agent can edit it. */
  kindLine: string;
  preview: string;
  chars: number;
  /** Read-only-to-agent items get a lock. */
  readOnly?: boolean;
  tone?: "primary" | "default";
}

function describeEntry(e: InstanceContextEntry): SeenItem {
  const preview = valuePreview(e.value).trim();
  const title = e.label?.trim() || e.key;
  const base = { key: e.key, preview, chars: preview.length };

  // Canonical doc detection — covers the working doc, the primary scratchpad,
  // AND extra attached scratchpads (user_scratchpad_<id>), so extras are
  // correctly shown as read-only, not generic attachments.
  const docKind = docKindForContextKey(e.key);
  if (docKind === "working") {
    return {
      ...base,
      icon: FileText,
      title: title || "Working document",
      kindLine: "The shared document — the agent reads it AND edits it each turn.",
      tone: "primary",
    };
  }
  if (docKind === "scratch") {
    return {
      ...base,
      icon: Lock,
      title: title || "Scratchpad",
      kindLine: "Your private notes — the agent reads them but never edits them.",
      readOnly: true,
    };
  }
  return {
    ...base,
    icon: e.slotMatched ? Braces : TypeIcon,
    title,
    kindLine: e.slotMatched
      ? "Fills one of this agent's declared context slots."
      : "Extra context you or the agent attached to this chat.",
  };
}

interface AgentSeesSheetProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentSeesSheet({
  conversationId,
  open,
  onOpenChange,
}: AgentSeesSheetProps) {
  const selectEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const entries = useAppSelector(selectEntries);
  // The active scope layers (org / scope(s) / project / task) — the agent
  // receives the resolved details behind these, so "what it sees" must include
  // them, not just the published context entries.
  const layers = useActiveContextLayerItems(conversationId);

  // Show EVERY published entry (matches the wire payload, which sends them all —
  // including empty ones); never silently drop something that is actually sent.
  const items = useMemo(
    () => entries.map(describeEntry).sort((a, b) => b.chars - a.chars),
    [entries],
  );
  const totalChars = items.reduce((n, i) => n + i.chars, 0);
  const nothingExtra = items.length === 0 && layers.count === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />
            What the agent sees
          </SheetTitle>
          <SheetDescription className="text-xs">
            The context attached to this chat right now.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-auto">
          {/* The always-present baseline — so "what's NOT extra" is explicit. */}
          <div className="flex items-start gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                The baseline — always sent
              </div>
              <div className="text-xs text-muted-foreground">
                Your messages, the agent&apos;s instructions + its tools, any
                files you attach, and its saved memory. Every agent gets these.
              </div>
            </div>
          </div>

          {/* Active scope layers — the agent receives the resolved details behind these. */}
          {layers.count > 0 && (
            <>
              <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Your active context
              </div>
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
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {layer.typeLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-1.5 text-[11px] text-muted-foreground/80">
                The agent receives the resolved details behind these scopes.
              </div>
            </>
          )}

          {nothingExtra ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing extra is attached — the agent sees only your messages and
              its own instructions.
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Also attached this turn
              </div>
              <ul className="divide-y divide-border/60">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key} className="px-4 py-3">
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
                      </div>
                      <div className="mt-0.5 pl-6 text-xs text-muted-foreground">
                        {item.kindLine}
                      </div>
                      <div className="mt-1.5 max-h-24 overflow-hidden rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {item.preview ? (
                          <span className="line-clamp-4 whitespace-pre-wrap break-words">
                            {item.preview.slice(0, 600)}
                            {item.preview.length > 600 ? "…" : ""}
                          </span>
                        ) : (
                          <span className="italic opacity-70">
                            (empty — sent, but has no content yet)
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {items.length} attached item{items.length === 1 ? "" : "s"}
            </span>{" "}
            · ~{totalChars.toLocaleString()} characters of content
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
