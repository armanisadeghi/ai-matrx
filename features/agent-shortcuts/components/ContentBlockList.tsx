"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Check,
  Copy,
  Edit2,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAgentShortcuts } from "../hooks/useAgentShortcuts";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import type {
  AgentContentBlock,
  AgentShortcutCategory,
  ScopeProps,
} from "../types";

export interface ContentBlockListProps extends ScopeProps {
  onEdit?: (block: AgentContentBlock) => void;
  onCreate?: () => void;
  className?: string;
  readonly?: boolean;
}

export function ContentBlockList({
  scope,
  scopeId,
  onEdit,
  onCreate,
  className,
  readonly = false,
}: ContentBlockListProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { contentBlocks, categories, isLoading, refetch } = useAgentShortcuts({
    scope,
    scopeId,
  });
  const crud = useAgentShortcutCrud({ scope, scopeId });

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentContentBlock | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const categoryById = useMemo(() => {
    const map = new Map<string, AgentShortcutCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    let out = [...contentBlocks];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter(
        (b) =>
          b.label.toLowerCase().includes(q) ||
          b.blockId.toLowerCase().includes(q) ||
          (b.description ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(b, q),
      );
    }
    if (categoryFilter !== "all") {
      out = out.filter((b) => b.categoryId === categoryFilter);
    }
    if (activeFilter === "active") out = out.filter((b) => b.isActive);
    else if (activeFilter === "inactive") out = out.filter((b) => !b.isActive);
    out.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
    return out;
  }, [contentBlocks, searchQuery, categoryFilter, activeFilter]);

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({ title: "Copied", description: "ID copied to clipboard" });
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy ID",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (block: AgentContentBlock) => {
    try {
      await crud.updateContentBlock(block.id, { isActive: !block.isActive });
      toast({
        title: block.isActive ? "Deactivated" : "Activated",
        description: block.label,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await crud.deleteContentBlock(deleteTarget.id);
      toast({ title: "Deleted", description: deleteTarget.label });
      setDeleteTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete block";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    activeFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setActiveFilter("all");
  };

  const availableCategories = categories.filter((c) =>
    contentBlocks.some((b) => b.categoryId === c.id),
  );

  if (isMobile) {
    return (
      <div className={`flex flex-col h-full ${className ?? ""}`}>
        <div className="flex flex-col gap-2 p-3 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Content Blocks</h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {!readonly && onCreate && (
                <Button size="sm" onClick={onCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New
                </Button>
              )}
            </div>
          </div>
          <Input
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-[16px]"
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {isLoading && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No content blocks found
              </div>
            )}
            {filtered.map((block) => {
              const cat = block.categoryId
                ? categoryById.get(block.categoryId)
                : null;
              return (
                <Card
                  key={block.id}
                  className="cursor-pointer"
                  onClick={() => onEdit?.(block)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-primary mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {block.label}
                          </div>
                          <code className="text-[11px] text-muted-foreground">
                            {block.blockId}
                          </code>
                          {block.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {block.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={block.isActive}
                        onCheckedChange={() =>
                          !readonly && handleToggleActive(block)
                        }
                        onClick={(e) => e.stopPropagation()}
                        disabled={readonly}
                      />
                    </div>
                    {cat && (
                      <Badge variant="secondary" className="text-xs">
                        {cat.label}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {deleteTarget && (
          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Content Block</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete &quot;{deleteTarget.label}&quot;? This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full ${className ?? ""}`}>
        <div className="flex-shrink-0 p-4 border-b border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Content Blocks</h2>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button onClick={() => refetch()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              {!readonly && onCreate && (
                <Button onClick={onCreate} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Block
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Search blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md text-[16px]"
            />

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFilter}
              onValueChange={(v) =>
                setActiveFilter(v as typeof activeFilter)
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[260px]">ID</TableHead>
                  <TableHead className="min-w-[200px]">Block ID</TableHead>
                  <TableHead className="min-w-[200px]">Label</TableHead>
                  <TableHead className="min-w-[160px]">Category</TableHead>
                  <TableHead className="min-w-[260px]">Description</TableHead>
                  <TableHead className="w-[80px]">Sort</TableHead>
                  <TableHead className="w-[90px] text-center">Active</TableHead>
                  <TableHead className="text-right w-[140px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((block) => {
                  const cat = block.categoryId
                    ? categoryById.get(block.categoryId)
                    : null;
                  return (
                    <TableRow
                      key={block.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onEdit?.(block)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-2 font-mono text-xs hover:bg-accent w-full justify-start"
                              onClick={(e) => handleCopyId(block.id, e)}
                            >
                              {copiedId === block.id ? (
                                <Check className="h-3 w-3 text-success flex-shrink-0" />
                              ) : (
                                <Copy className="h-3 w-3 flex-shrink-0" />
                              )}
                              <span className="truncate">{block.id}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy ID</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{block.blockId}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <div className="font-medium">{block.label}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {cat ? (
                          <Badge variant="secondary" className="text-xs">
                            {cat.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Uncategorised
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {block.description ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>{block.sortOrder}</TableCell>
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={block.isActive}
                          onCheckedChange={() =>
                            !readonly && handleToggleActive(block)
                          }
                          disabled={readonly}
                        />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          {onEdit && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEdit(block)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                          )}
                          {!readonly && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeleteTarget(block)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">No content blocks found</p>
                {hasActiveFilters && (
                  <Button
                    variant="link"
                    onClick={clearFilters}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {deleteTarget && (
          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Content Block</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete &quot;{deleteTarget.label}&quot;? This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <div className="sr-only">Scope: {scope} {scopeId ?? ""}</div>
      </div>
    </TooltipProvider>
  );
}
