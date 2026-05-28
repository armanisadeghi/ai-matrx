"use client";

import React, { useMemo, useState } from "react";
import {
  Lightbulb,
  Loader2,
  Plus,
  Settings,
  Upload,
  Globe2,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkills } from "../hooks/useSkills";
import { useSkillCategories } from "../hooks/useSkillCategories";
import type { SkillRow } from "../types";

type ScopeFilter = "all" | "system" | "public" | "personal";

interface SkillsBrowserProps {
  onSelect: (skillId: string) => void;
  onNew: () => void;
  onCategories?: () => void;
  onIngest?: () => void;
}

export function SkillsBrowser({
  onSelect,
  onNew,
  onCategories,
  onIngest,
}: SkillsBrowserProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { skills, loading, error } = useSkills();
  const { categories } = useSkillCategories();

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [categoryId, setCategoryId] = useState<string | "all">("all");

  const categoryLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.id] = c.label;
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (q) {
        const haystack = `${s.label} ${s.skillId} ${s.description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryId !== "all" && s.categoryId !== categoryId) return false;
      if (scope === "system" && !s.isSystem) return false;
      if (scope === "public" && !s.isPublic) return false;
      if (scope === "personal" && (s.isSystem || s.isPublic)) return false;
      return true;
    });
  }, [skills, search, scope, categoryId]);

  const groups = useMemo(() => {
    const map: Record<string, SkillRow[]> = {};
    const uncategorized: SkillRow[] = [];
    for (const s of filtered) {
      if (!s.categoryId) {
        uncategorized.push(s);
      } else {
        (map[s.categoryId] ??= []).push(s);
      }
    }
    const groupedIds = Object.keys(map).sort((a, b) =>
      (categoryLabelById[a] ?? "").localeCompare(categoryLabelById[b] ?? ""),
    );
    const out: Array<{ key: string; label: string; items: SkillRow[] }> = [];
    for (const id of groupedIds) {
      out.push({
        key: id,
        label: categoryLabelById[id] ?? "Uncategorized",
        items: map[id],
      });
    }
    if (uncategorized.length) {
      out.push({ key: "__none__", label: "Uncategorized", items: uncategorized });
    }
    return out;
  }, [filtered, categoryLabelById]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter / actions bar */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-border/60">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="h-8 flex-1"
        />
        <ScopeChips value={scope} onChange={setScope} />
        <CategoryDropdown
          value={categoryId}
          onChange={setCategoryId}
          categories={categories}
        />
        <button
          type="button"
          onClick={onNew}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
        {isAdmin && onIngest && (
          <button
            type="button"
            onClick={onIngest}
            aria-label="Filesystem ingest"
            title="Filesystem ingest"
            className={cn(
              "inline-flex items-center justify-center h-8 w-8 rounded-md",
              "bg-background border border-border text-foreground",
              "hover:bg-accent transition-colors",
            )}
          >
            <Upload className="h-4 w-4" />
          </button>
        )}
        {isAdmin && onCategories && (
          <button
            type="button"
            onClick={onCategories}
            aria-label="Categories admin"
            title="Categories admin"
            className={cn(
              "inline-flex items-center justify-center h-8 w-8 rounded-md",
              "bg-background border border-border text-foreground",
              "hover:bg-accent transition-colors",
            )}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && skills.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skills…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search || scope !== "all" || categoryId !== "all"
              ? "No skills match your filters."
              : "No skills yet. Click “New” to create one."}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="flex flex-col">
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-medium",
                  "bg-muted/40 border-y border-border/60",
                  "text-muted-foreground uppercase tracking-wide",
                )}
              >
                <span className="flex-1 truncate">{g.label}</span>
                <span className="tabular-nums">{g.items.length}</span>
              </div>
              {g.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "group flex items-start gap-3 px-4 py-2.5 text-left w-full",
                    "hover:bg-muted/40 transition-colors",
                    "border-b border-border/40 last:border-b-0",
                  )}
                >
                  <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {s.label}
                      <ScopeBadge skill={s} />
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {s.description}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground/70 font-mono pt-0.5 truncate max-w-[160px]">
                    {s.skillId}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ScopeChips({
  value,
  onChange,
}: {
  value: ScopeFilter;
  onChange: (v: ScopeFilter) => void;
}) {
  const chips: Array<{ key: ScopeFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "system", label: "System" },
    { key: "public", label: "Public" },
    { key: "personal", label: "Personal" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden h-8 shrink-0">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={cn(
            "px-2.5 text-xs font-medium transition-colors",
            value === c.key
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function CategoryDropdown({
  value,
  onChange,
  categories,
}: {
  value: string | "all";
  onChange: (v: string | "all") => void;
  categories: Array<{ id: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as string | "all")}
      className={cn(
        "h-8 px-2 text-sm rounded-md shrink-0",
        "bg-background border border-border text-foreground",
        "focus:outline-none focus:ring-1 focus:ring-ring",
      )}
      title="Filter by category"
    >
      <option value="all">All categories</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function ScopeBadge({ skill }: { skill: SkillRow }) {
  if (skill.isSystem) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 px-1.5 h-4 text-[10px] font-normal"
      >
        <ShieldCheck className="h-2.5 w-2.5" />
        System
      </Badge>
    );
  }
  if (skill.isPublic) {
    return (
      <Badge
        variant="outline"
        className="gap-1 px-1.5 h-4 text-[10px] font-normal"
      >
        <Globe2 className="h-2.5 w-2.5" />
        Public
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 px-1.5 h-4 text-[10px] font-normal text-muted-foreground"
    >
      <UserRound className="h-2.5 w-2.5" />
      Personal
    </Badge>
  );
}
