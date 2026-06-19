"use client";

import { cn } from "@/lib/utils";
import type { FieldAdapter, FieldDiffProps } from "./types";
import type { DiffNode } from "../engine/types";
import { formatValue, filterChanges } from "../engine/diff-utils";
import { InlineTextDiff } from "./InlineTextDiff";

/* ------------------------------------------------------------------ */
/* Consistent color scheme (theme-aware: light + dark)                */
/*   unchanged: text-muted-foreground / bg-transparent                */
/*   removed:   text-red-700 dark:text-red-300 / red tinted bg        */
/*   added:     text-green-700 dark:text-green-300 / green tinted bg  */
/*   modified:  text-amber-600 dark:text-amber-400 (label only)       */
/* ------------------------------------------------------------------ */

/** Two-column row: old value | new value, following the table grid */
function TwoColumnRow({
  oldContent,
  newContent,
  changeType,
}: {
  oldContent: React.ReactNode;
  newContent: React.ReactNode;
  changeType: DiffNode["changeType"];
}) {
  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
      <div className="border-r border-border" />
      <div
        className={cn(
          "px-3 py-2 border-r border-border whitespace-pre-wrap break-words",
          changeType === "removed" || changeType === "modified"
            ? "bg-red-50 dark:bg-red-950/15"
            : "",
          changeType === "added" ? "bg-muted/10 text-muted-foreground/50" : "",
        )}
      >
        {oldContent}
      </div>
      <div
        className={cn(
          "px-3 py-2 whitespace-pre-wrap break-words",
          changeType === "added" || changeType === "modified"
            ? "bg-green-50 dark:bg-green-950/15"
            : "",
          changeType === "removed"
            ? "bg-muted/10 text-muted-foreground/50"
            : "",
        )}
      >
        {newContent}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text adapter                                                       */
/* ------------------------------------------------------------------ */

function TextDiffRenderer({ node }: FieldDiffProps) {
  const oldStr = node.oldValue != null ? String(node.oldValue) : "";
  const newStr = node.newValue != null ? String(node.newValue) : "";

  // A genuine edit on both sides → run the word/line-level engine so only the
  // text that actually changed is highlighted (identical text stays plain).
  if (node.changeType === "modified" && oldStr !== "" && newStr !== "") {
    return (
      <div className="grid grid-cols-[200px_1fr] text-xs">
        <div className="border-r border-border" />
        <div className="min-w-0 overflow-x-auto">
          <InlineTextDiff original={oldStr} modified={newStr} />
        </div>
      </div>
    );
  }

  const oldText = oldStr !== "" ? oldStr : "—";
  const newText = newStr !== "" ? newStr : "—";

  return (
    <TwoColumnRow
      oldContent={
        <span
          className={
            node.changeType === "removed"
              ? "text-red-700 dark:text-red-300"
              : "text-foreground/80"
          }
        >
          {oldText}
        </span>
      }
      newContent={
        <span
          className={
            node.changeType === "added"
              ? "text-green-700 dark:text-green-300"
              : "text-foreground/80"
          }
        >
          {newText}
        </span>
      }
      changeType={node.changeType}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Boolean adapter                                                    */
/* ------------------------------------------------------------------ */

function BooleanDiffRenderer({ node }: FieldDiffProps) {
  const oldVal = node.oldValue != null ? (node.oldValue ? "Yes" : "No") : "—";
  const newVal = node.newValue != null ? (node.newValue ? "Yes" : "No") : "—";

  return (
    <TwoColumnRow
      oldContent={
        <span
          className={
            node.changeType !== "unchanged"
              ? "text-red-700 dark:text-red-300"
              : "text-foreground/80"
          }
        >
          {oldVal}
        </span>
      }
      newContent={
        <span
          className={
            node.changeType !== "unchanged"
              ? "text-green-700 dark:text-green-300"
              : "text-foreground/80"
          }
        >
          {newVal}
        </span>
      }
      changeType={node.changeType}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Tags adapter                                                       */
/* ------------------------------------------------------------------ */

function TagsDiffRenderer({ node }: FieldDiffProps) {
  const oldTags = Array.isArray(node.oldValue)
    ? (node.oldValue as string[])
    : [];
  const newTags = Array.isArray(node.newValue)
    ? (node.newValue as string[])
    : [];

  return (
    <TwoColumnRow
      oldContent={
        <div className="flex flex-wrap gap-1">
          {oldTags.length === 0 && (
            <span className="text-muted-foreground">—</span>
          )}
          {oldTags.map((tag) => {
            const wasRemoved = !newTags.includes(tag);
            return (
              <span
                key={tag}
                className={cn(
                  "inline-block px-1.5 py-0.5 rounded text-[0.625rem]",
                  wasRemoved
                    ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 line-through"
                    : "bg-muted text-foreground/80",
                )}
              >
                {tag}
              </span>
            );
          })}
        </div>
      }
      newContent={
        <div className="flex flex-wrap gap-1">
          {newTags.length === 0 && (
            <span className="text-muted-foreground">—</span>
          )}
          {newTags.map((tag) => {
            const wasAdded = !oldTags.includes(tag);
            return (
              <span
                key={tag}
                className={cn(
                  "inline-block px-1.5 py-0.5 rounded text-[0.625rem]",
                  wasAdded
                    ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                    : "bg-muted text-foreground/80",
                )}
              >
                {tag}
              </span>
            );
          })}
        </div>
      }
      changeType={node.changeType}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Key-Value / Settings adapter                                       */
/* ------------------------------------------------------------------ */

function KeyValueDiffRenderer({ node }: FieldDiffProps) {
  if (node.children && node.children.length > 0) {
    return (
      <>
        {node.children.map((child) => {
          const oldVal =
            child.oldValue != null ? formatValue(child.oldValue) : "—";
          const newVal =
            child.newValue != null ? formatValue(child.newValue) : "—";
          const changed = child.changeType !== "unchanged";

          return (
            <div
              key={child.key}
              className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
            >
              <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
                {child.key}
              </div>
              <div
                className={cn(
                  "px-3 py-1.5 border-r border-border",
                  changed && child.changeType !== "added"
                    ? "bg-red-50 dark:bg-red-950/15 text-red-700 dark:text-red-300"
                    : "text-foreground/80",
                  child.changeType === "added"
                    ? "text-muted-foreground/50"
                    : "",
                )}
              >
                {oldVal}
              </div>
              <div
                className={cn(
                  "px-3 py-1.5",
                  changed && child.changeType !== "removed"
                    ? "bg-green-50 dark:bg-green-950/15 text-green-700 dark:text-green-300"
                    : "text-foreground/80",
                  child.changeType === "removed"
                    ? "text-muted-foreground/50"
                    : "",
                )}
              >
                {newVal}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return <JsonObjectDiffRenderer node={node} viewMode="all" />;
}

/* ------------------------------------------------------------------ */
/* JSON Object adapter                                                */
/* ------------------------------------------------------------------ */

function JsonObjectDiffRenderer({ node }: FieldDiffProps) {
  const oldJson =
    node.oldValue != null ? JSON.stringify(node.oldValue, null, 2) : "—";
  const newJson =
    node.newValue != null ? JSON.stringify(node.newValue, null, 2) : "—";

  return (
    <TwoColumnRow
      oldContent={
        <pre
          className={cn(
            "font-mono text-[0.625rem] leading-relaxed",
            node.changeType !== "unchanged"
              ? "text-red-700 dark:text-red-300"
              : "text-foreground/70",
          )}
        >
          {oldJson}
        </pre>
      }
      newContent={
        <pre
          className={cn(
            "font-mono text-[0.625rem] leading-relaxed",
            node.changeType !== "unchanged"
              ? "text-green-700 dark:text-green-300"
              : "text-foreground/70",
          )}
        >
          {newJson}
        </pre>
      }
      changeType={node.changeType}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Default fallback adapter                                           */
/* ------------------------------------------------------------------ */

function DefaultDiffRenderer({ node }: FieldDiffProps) {
  const oldDisplay = node.oldValue != null ? formatValue(node.oldValue) : "—";
  const newDisplay = node.newValue != null ? formatValue(node.newValue) : "—";

  return (
    <TwoColumnRow
      oldContent={
        <span
          className={
            node.changeType !== "unchanged" && node.oldValue != null
              ? "text-red-700 dark:text-red-300"
              : "text-foreground/80"
          }
        >
          {oldDisplay}
        </span>
      }
      newContent={
        <span
          className={
            node.changeType !== "unchanged" && node.newValue != null
              ? "text-green-700 dark:text-green-300"
              : "text-foreground/80"
          }
        >
          {newDisplay}
        </span>
      }
      changeType={node.changeType}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Summary text helpers                                               */
/* ------------------------------------------------------------------ */

function defaultSummaryText(node: DiffNode): string {
  if (node.changeType === "added") return `Added`;
  if (node.changeType === "removed") return `Removed`;
  if (Array.isArray(node.oldValue) && Array.isArray(node.newValue)) {
    const diff = node.newValue.length - node.oldValue.length;
    if (diff > 0) return `${diff} item${diff !== 1 ? "s" : ""} added`;
    if (diff < 0)
      return `${Math.abs(diff)} item${Math.abs(diff) !== 1 ? "s" : ""} removed`;
    return "Items changed";
  }
  if (typeof node.oldValue === "string" && typeof node.newValue === "string") {
    const oldTrunc =
      node.oldValue.length > 30
        ? node.oldValue.slice(0, 30) + "..."
        : node.oldValue;
    const newTrunc =
      node.newValue.length > 30
        ? node.newValue.slice(0, 30) + "..."
        : node.newValue;
    return `"${oldTrunc}" → "${newTrunc}"`;
  }
  if (typeof node.oldValue === "number" && typeof node.newValue === "number") {
    return `${node.oldValue} → ${node.newValue}`;
  }
  if (
    typeof node.oldValue === "boolean" &&
    typeof node.newValue === "boolean"
  ) {
    return `${node.oldValue ? "Yes" : "No"} → ${node.newValue ? "Yes" : "No"}`;
  }
  return "Value changed";
}

/* ------------------------------------------------------------------ */
/* Exported adapters                                                  */
/* ------------------------------------------------------------------ */

export const TextFieldAdapter: FieldAdapter = {
  label: "Text",
  renderDiff: TextDiffRenderer,
  toSummaryText: defaultSummaryText,
};

export const BooleanFieldAdapter: FieldAdapter = {
  label: "Boolean",
  renderDiff: BooleanDiffRenderer,
  toSummaryText: defaultSummaryText,
};

export const TagsFieldAdapter: FieldAdapter = {
  label: "Tags",
  renderDiff: TagsDiffRenderer,
  toSummaryText: (node) => {
    const oldArr = Array.isArray(node.oldValue) ? node.oldValue : [];
    const newArr = Array.isArray(node.newValue) ? node.newValue : [];
    const added = newArr.filter((t: unknown) => !oldArr.includes(t)).length;
    const removed = oldArr.filter((t: unknown) => !newArr.includes(t)).length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    return parts.join(", ") || "Tags changed";
  },
};

export const JsonObjectAdapter: FieldAdapter = {
  label: "Object",
  renderDiff: JsonObjectDiffRenderer,
  toSummaryText: defaultSummaryText,
};

export const KeyValueAdapter: FieldAdapter = {
  label: "Settings",
  renderDiff: KeyValueDiffRenderer,
  toSummaryText: (node) => {
    if (!node.children) return "Settings changed";
    const changed = filterChanges(node.children);
    if (changed.length === 1) {
      const c = changed[0];
      return `${c.key}: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`;
    }
    return `${changed.length} setting${changed.length !== 1 ? "s" : ""} changed`;
  },
};

export const DefaultFieldAdapter: FieldAdapter = {
  label: "Field",
  renderDiff: DefaultDiffRenderer,
  toSummaryText: defaultSummaryText,
};
