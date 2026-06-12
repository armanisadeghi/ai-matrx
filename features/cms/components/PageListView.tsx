"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import type { ClientPageSummary } from "@/features/cms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ArrowUpDown,
  RefreshCw,
  Home,
  Navigation,
  Globe,
  FileCode,
  BookOpen,
  Users,
  Mail,
  Briefcase,
} from "lucide-react";

interface PageListViewProps {
  pages: ClientPageSummary[];
  isLoading: boolean;
  error: string | null;
  onOpenPage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onRefresh: () => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  root: Home,
  general: FileText,
  services: Briefcase,
  education: BookOpen,
  team: Users,
  contact: Mail,
};

const PAGE_TYPE_COLORS: Record<string, string> = {
  home: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  standard: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  service: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  blog: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  listing: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
};

type SortField = "title" | "category" | "updated_at" | "sort_order";
type SortDir = "asc" | "desc";

export default function PageListView({
  pages,
  isLoading,
  error,
  onOpenPage,
  onDeletePage,
  onRefresh,
}: PageListViewProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("sort_order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientPageSummary | null>(
    null,
  );

  // ── Derive categories from data ──────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(pages.map((p) => p.category).filter(Boolean));
    return Array.from(cats).sort() as string[];
  }, [pages]);

  // ── Filter & sort ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...pages];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(p, q),
      );
    }

    if (categoryFilter) {
      result = result.filter((p) => p.category === categoryFilter);
    }

    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "category":
          aVal = (a.category ?? "").toLowerCase();
          bVal = (b.category ?? "").toLowerCase();
          break;
        case "updated_at":
          aVal = a.updated_at;
          bVal = b.updated_at;
          break;
        case "sort_order":
          aVal = a.sort_order;
          bVal = b.sort_order;
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [pages, search, categoryFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading pages…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load pages</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search pages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer active:scale-[0.85] active:transition-none"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <Button
            variant={categoryFilter === null ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-shrink-0"
            onClick={() => setCategoryFilter(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs flex-shrink-0 capitalize"
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">
              {pages.length === 0
                ? "No pages yet"
                : "No pages match your filters"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer active:scale-[0.92] active:transition-none"
                      onClick={() => toggleSort("title")}
                    >
                      Page
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer active:scale-[0.92] active:transition-none"
                      onClick={() => toggleSort("category")}
                    >
                      Category
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">
                    Status
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer active:scale-[0.92] active:transition-none"
                      onClick={() => toggleSort("updated_at")}
                    >
                      Updated
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-12">
                    {/* actions */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((page) => {
                  const CatIcon = (CATEGORY_ICONS[page.category ?? ""] ??
                    FileCode) as React.FC<{ className?: string }>;
                  const typeColor =
                    PAGE_TYPE_COLORS[page.page_type ?? ""] ??
                    PAGE_TYPE_COLORS.standard;

                  return (
                    <tr
                      key={page.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 active:bg-muted/50 cursor-pointer transition-colors select-none"
                      onClick={() => onOpenPage(page.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center flex-shrink-0">
                            <CatIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground truncate">
                                {page.title}
                              </span>
                              {page.is_home_page && (
                                <Home className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              )}
                              {page.show_in_nav && (
                                <Navigation className="h-3 w-3 text-blue-500 flex-shrink-0" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              /{page.slug}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {page.category ?? "general"}
                          </Badge>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}
                          >
                            {page.page_type ?? "standard"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          {page.is_published ? (
                            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                              <Globe className="h-2.5 w-2.5 mr-1" />
                              Published
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Unpublished
                            </Badge>
                          )}
                          {page.has_draft && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400"
                            >
                              Draft
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {new Date(page.updated_at).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPage(page.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPage(page.id);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(page);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Count ───────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {pages.length} pages
        </p>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete page"
        description={
          <>
            Permanently delete <b>{deleteTarget?.title}</b>? This cannot be
            undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            onDeletePage(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
