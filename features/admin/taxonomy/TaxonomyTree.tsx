"use client";

// Tree view — the working CRUD surface: collapsible Domain → Feature → Sub-feature
// rows with inline actions. Every count is a real number from the DB, not decoration.

import { useState } from "react";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NodeDialogState } from "./NodeDialog";
import { STATUS_STYLES, type TaxonomyTreeNode } from "./types";

interface TreeProps {
  nodes: TaxonomyTreeNode[];
  onOpenDialog: (state: NodeDialogState) => void;
  onDelete: (node: TaxonomyTreeNode) => void;
}

export default function TaxonomyTree({ nodes, onOpenDialog, onDelete }: TreeProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {nodes.map((domain, index) => (
        <TreeRow
          key={domain.id}
          node={domain}
          depth={0}
          isLast={index === nodes.length - 1}
          onOpenDialog={onOpenDialog}
          onDelete={onDelete}
        />
      ))}
      {nodes.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nothing matches the current filters.
        </div>
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  isLast,
  onOpenDialog,
  onDelete,
}: {
  node: TaxonomyTreeNode;
  depth: number;
  isLast: boolean;
  onOpenDialog: (state: NodeDialogState) => void;
  onDelete: (node: TaxonomyTreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0 ? false : true);
  const hasChildren = node.children.length > 0;
  const status = STATUS_STYLES[node.status];
  const childLevel = node.level === "domain" ? "feature" : "subfeature";

  return (
    <div className={cn(depth === 0 && !isLast && "border-b border-border")}>
      <div
        className={cn(
          "group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50",
          depth === 0 && "py-2.5",
        )}
        style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground",
            !hasChildren && "invisible",
            open && "rotate-90",
          )}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", status.dot)} />
        <span
          className={cn(
            "truncate",
            depth === 0
              ? "text-sm font-semibold text-foreground"
              : "text-sm text-foreground",
          )}
        >
          {node.name}
        </span>
        <code className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
          {node.slug}
        </code>
        <span
          className={cn(
            "hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium md:inline",
            status.badge,
          )}
        >
          {status.label}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          {node.level === "domain" && (
            <span title="Features in this domain">{node.child_count} features</span>
          )}
          {node.entity_count > 0 && (
            <span title="DB entities assigned to this node">
              {node.entity_count} entities
            </span>
          )}
          {node.review_count > 0 && (
            <a
              href="/administration/users/agent-review"
              className="text-primary hover:underline"
              title="Agent-review items classified under this node"
            >
              {node.review_count} reviews
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {node.level !== "subfeature" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={`Add ${childLevel}`}
              onClick={() =>
                onOpenDialog({ mode: "create", parentId: node.id, level: childLevel })
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Edit"
            onClick={() => onOpenDialog({ mode: "edit", node })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            title="Delete (refuses when anything still references the node)"
            onClick={() => onDelete(node)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={false}
                onOpenDialog={onOpenDialog}
                onDelete={onDelete}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
