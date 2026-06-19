"use client";

import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";
import type { DiffNode } from "@/components/diff/engine/types";
import { InlineTextDiff } from "@/components/diff/adapters/InlineTextDiff";

interface MessageLike {
  role: string;
  content: Array<{ type: string; text?: string }> | string;
}

function extractText(msg: MessageLike): string {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return msg.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");
}

function MessagesDiffRenderer({ node }: FieldDiffProps) {
  const oldMessages = Array.isArray(node.oldValue)
    ? (node.oldValue as MessageLike[])
    : [];
  const newMessages = Array.isArray(node.newValue)
    ? (node.newValue as MessageLike[])
    : [];

  // If we have matched children from the diff engine, render per-message
  if (node.children && node.children.length > 0) {
    return (
      <>
        {node.children.map((child, i) => (
          <MessageRow key={child.key ?? i} child={child} index={i} />
        ))}
      </>
    );
  }

  // Fallback: render all messages side by side
  const maxLen = Math.max(oldMessages.length, newMessages.length);
  return (
    <>
      {Array.from({ length: maxLen }, (_, i) => {
        const oldMsg = oldMessages[i];
        const newMsg = newMessages[i];
        const oldT = oldMsg ? extractText(oldMsg) : "";
        const newT = newMsg ? extractText(newMsg) : "";
        const roleLabel = (
          <>
            #{i + 1} {(newMsg?.role ?? oldMsg?.role ?? "").toUpperCase()}
          </>
        );

        if (oldMsg && newMsg && oldT !== "" && newT !== "" && oldT !== newT) {
          return (
            <div
              key={i}
              className="grid grid-cols-[200px_1fr] text-xs border-t border-border/30"
            >
              <div className="px-3 py-2 border-r border-border text-muted-foreground pl-8">
                {roleLabel}
              </div>
              <div className="min-w-0 overflow-x-auto">
                <InlineTextDiff original={oldT} modified={newT} />
              </div>
            </div>
          );
        }

        return (
          <div
            key={i}
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-2 border-r border-border text-muted-foreground pl-8">
              {roleLabel}
            </div>
            <div
              className={cn(
                "px-3 py-2 border-r border-border whitespace-pre-wrap",
                !oldMsg
                  ? "text-muted-foreground/50"
                  : oldMsg &&
                      newMsg &&
                      extractText(oldMsg) !== extractText(newMsg)
                    ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
                    : "text-foreground/80",
              )}
            >
              {oldMsg ? extractText(oldMsg) : "—"}
            </div>
            <div
              className={cn(
                "px-3 py-2 whitespace-pre-wrap",
                !newMsg
                  ? "text-muted-foreground/50"
                  : oldMsg &&
                      newMsg &&
                      extractText(oldMsg) !== extractText(newMsg)
                    ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
                    : "text-foreground/80",
              )}
            >
              {newMsg ? extractText(newMsg) : "—"}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MessageRow({ child, index }: { child: DiffNode; index: number }) {
  const oldMsg = child.oldValue as MessageLike | undefined;
  const newMsg = child.newValue as MessageLike | undefined;
  const role = (newMsg?.role ?? oldMsg?.role ?? "unknown").toUpperCase();
  const oldText = oldMsg ? extractText(oldMsg) : "";
  const newText = newMsg ? extractText(newMsg) : "";

  const roleBadge = (
    <div className="flex items-center gap-1">
      <span>#{index + 1}</span>
      <span
        className={cn(
          "text-[0.625rem] px-1 rounded",
          child.changeType === "added"
            ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
            : child.changeType === "removed"
              ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              : "bg-muted",
        )}
      >
        {role}
      </span>
    </div>
  );

  // Edited message → word/line-level diff so only the changed text is tinted
  // (the old renderer lit up the entire message even for a one-word change).
  if (child.changeType === "modified" && oldText !== "" && newText !== "") {
    return (
      <div className="grid grid-cols-[200px_1fr] text-xs border-t border-border/30">
        <div className="px-3 py-2 border-r border-border text-muted-foreground pl-8">
          {roleBadge}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <InlineTextDiff original={oldText} modified={newText} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30">
      <div className="px-3 py-2 border-r border-border text-muted-foreground pl-8">
        {roleBadge}
      </div>
      <div
        className={cn(
          "px-3 py-2 border-r border-border whitespace-pre-wrap break-words",
          child.changeType === "removed"
            ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
            : "",
          child.changeType === "added" ? "text-muted-foreground/50" : "",
          child.changeType === "unchanged" ? "text-foreground/80" : "",
        )}
      >
        {oldText !== "" ? oldText : "—"}
      </div>
      <div
        className={cn(
          "px-3 py-2 whitespace-pre-wrap break-words",
          child.changeType === "added"
            ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
            : "",
          child.changeType === "removed" ? "text-muted-foreground/50" : "",
          child.changeType === "unchanged" ? "text-foreground/80" : "",
        )}
      >
        {newText !== "" ? newText : "—"}
      </div>
    </div>
  );
}

export const MessagesAdapter: FieldAdapter = {
  label: "Messages",
  icon: MessageSquare,
  renderDiff: MessagesDiffRenderer,
  toSummaryText: (node) => {
    const oldArr = Array.isArray(node.oldValue) ? node.oldValue : [];
    const newArr = Array.isArray(node.newValue) ? node.newValue : [];
    if (oldArr.length !== newArr.length) {
      const diff = newArr.length - oldArr.length;
      return diff > 0
        ? `${diff} message${diff !== 1 ? "s" : ""} added`
        : `${Math.abs(diff)} message${Math.abs(diff) !== 1 ? "s" : ""} removed`;
    }
    if (node.children) {
      const changed = node.children.filter(
        (c) => c.changeType !== "unchanged",
      ).length;
      return `${changed} message${changed !== 1 ? "s" : ""} modified`;
    }
    return "Messages changed";
  },
};
