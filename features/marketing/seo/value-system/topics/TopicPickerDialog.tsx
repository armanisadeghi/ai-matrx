"use client";

/**
 * ONE picker for both acts that need a topic: pinning a parent, and placing a
 * keyword. Each option shows its full lineage and the root type in business
 * language, because choosing "Data Destruction Services" means nothing until
 * you can see it sits under a service you sell.
 *
 * Choices that the DB would refuse (a topic's own subtree, when pinning a
 * parent) are not offered. The DB still guards — this only avoids handing the
 * user a guaranteed failure.
 */

import { useState } from "react";
import { Check, Loader2, Search, Slash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import type { TopicNode } from "../types";
import { rootTypeMeta } from "./types";
import { lineageOf, type BuiltTree } from "./lib";

export interface TopicPickerRequest {
  /** What we are choosing a topic FOR. */
  mode: "parent" | "keyword";
  title: string;
  description: string;
  /** Names the thing being re-parented / placed, for the copy. */
  subject: string;
  currentTopicId: string | null;
  /** Ids that cannot be chosen (a topic's own subtree). */
  forbidden: Set<string>;
  /** Label for the "no topic" choice, or null to hide it. */
  clearLabel: string | null;
  /**
   * Prompt for the expert's WHY, or null when this act does not record one.
   * A placement carries a reason (P24); re-parenting a topic does not.
   */
  reasonPrompt: string | null;
  onChoose: (topicId: string | null, reason: string | null) => void;
}

export function TopicPickerDialog({
  request,
  tree,
  busy,
  onCancel,
}: {
  request: TopicPickerRequest;
  tree: BuiltTree;
  busy: boolean;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  // Typed BEFORE the topic is picked, because picking is the last click: the
  // list rows are the submit button. Optional — an expert who just wants the
  // keyword placed is never blocked to explain themselves.
  const [reason, setReason] = useState("");
  const choose = (topicId: string | null) =>
    request.onChoose(topicId, reason.trim() || null);

  // React Compiler is on — no manual memoization (CLAUDE.md core invariants).
  const options = (() => {
    const needle = search.trim().toLowerCase();
    const rows = [...tree.byId.values()]
      .filter((node) => !request.forbidden.has(node.topic.id))
      .map((node) => ({
        topic: node.topic,
        rootType: node.rootType,
        lineage: lineageOf(tree, node.topic.id)
          .slice(0, -1)
          .map((entry) => entry.name)
          .join(" › "),
        keywords: node.subtree.keywords,
      }))
      .filter(
        (row) =>
          !needle ||
          row.topic.name.toLowerCase().includes(needle) ||
          row.lineage.toLowerCase().includes(needle),
      );
    rows.sort(
      (a, b) => b.keywords - a.keywords || a.topic.name.localeCompare(b.topic.name),
    );
    return rows.slice(0, 200);
  })();

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{request.title}</DialogTitle>
          <DialogDescription>{request.description}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search topics…"
            className="h-8 pl-7 text-sm"
          />
        </div>

        {request.reasonPrompt ? (
          <div className="space-y-1">
            <label
              htmlFor="topic-picker-reason"
              className="text-xs font-medium text-foreground"
            >
              {request.reasonPrompt}
            </label>
            <Textarea
              id="topic-picker-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Optional — in your own words. This is what teaches the rules."
              className="resize-none text-sm"
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded border border-border">
          {request.clearLabel ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => choose(null)}
              className={cn(
                "flex w-full items-center gap-2 border-b border-border px-2.5 py-2 text-left text-sm hover:bg-muted/60",
                request.currentTopicId === null && "bg-muted/40",
              )}
            >
              <Slash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{request.clearLabel}</span>
            </button>
          ) : null}

          {options.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No topic matches “{search}”. Close this and use{" "}
              <span className="font-medium text-foreground">New topic</span> to
              create one.
            </p>
          ) : (
            options.map((row) => {
              const meta = rootTypeMeta(row.rootType);
              const selected = row.topic.id === request.currentTopicId;
              return (
                <button
                  key={row.topic.id}
                  type="button"
                  disabled={busy}
                  // The name is spread across three spans; screen readers (and
                  // automation) need it as one label.
                  aria-label={
                    row.lineage
                      ? `${row.topic.name}, under ${row.lineage}`
                      : row.topic.name
                  }
                  onClick={() => choose(row.topic.id)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-border px-2.5 py-2 text-left last:border-b-0 hover:bg-muted/60",
                    selected && "bg-muted/40",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    {row.lineage ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {row.lineage} ›
                      </span>
                    ) : null}
                    <span className="block truncate text-sm text-foreground">
                      {row.topic.name}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-[11px]",
                        meta.offering ? "text-success" : "text-info",
                      )}
                    >
                      {meta.offering
                        ? `Under a root that can become money — ${meta.label.toLowerCase()}`
                        : `Under an authority-only root — ${meta.label.toLowerCase()}`}
                    </span>
                  </span>
                  {row.keywords > 0 ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {row.keywords} kw
                    </span>
                  ) : null}
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          {busy ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { TopicNode };
