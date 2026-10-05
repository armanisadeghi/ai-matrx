"use client";

import React, { useMemo, useState } from "react";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_SKILLS_SURFACE_NAME, createAdminSkillsScope } from "@/features/surfaces/manifests/admin-skills.manifest";
import {
  Lightbulb,
  Loader2,
  Plus,
  Settings,
  Upload,
  Globe2,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, ControlRow, SearchField, SegmentedControl, Select } from "@ai-matrx/design-system/controls";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";

import { useSkills } from "../hooks/useSkills";
import { useSkillCategories } from "../hooks/useSkillCategories";
import type { SkillRow } from "../types";
import { getSkillProvenance } from "../skill-provenance";
import { SkillAttributionLine, SkillOriginBadges } from "./SkillOriginBadges";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { catalogProseText } from "@/features/content-ir/surfaces/kind-one-line";

type ScopeFilter = "all" | "system" | "public" | "personal";

interface SkillsBrowserProps {
  onSelect: (skillId: string) => void;
  onNew: () => void;
  onCategories?: () => void;
  onIngest?: () => void;
  /**
   * Route that opens ONE skill on its own, for the new-tab door.
   *
   * The entity registry deliberately gives `skill` no `hrefFor` — the only
   * id-addressed skill route is the super-admin admin console, and a door that
   * 403s is its own dead end. So the surface that HAS that route passes it
   * (the admin page → `?open=<id>`), and every other consumer gets the peek
   * alone rather than a link most users cannot follow.
   */
  skillHref?: (skillId: string) => string;
}

export function SkillsBrowser({
  onSelect,
  onNew,
  onCategories,
  onIngest,
  skillHref,
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
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SKILLS_SURFACE_NAME}
      getScope={() => createAdminSkillsScope({
        skills_section: "list",
        skills_list: skills,
        skills_stats: {
          total: skills.length,
          system: skills.filter((skill) => skill.isSystem).length,
          public: skills.filter((skill) => skill.isPublic).length,
          personal: skills.filter((skill) => !skill.isSystem && !skill.isPublic).length,
        },
        skills_search: search,
        skills_scope_filter: scope,
        skills_category_filter: categoryId,
      })}
    >
    <div className="flex flex-col h-full min-h-0">
      {/* Filter / actions bar — wraps on a narrow pane: search keeps a usable width. */}
      <ControlRow className="px-4 py-2 shrink-0 border-b border-border/60">
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills…"
          aria-label="Search skills"
          className="flex-1 basis-48"
        />
        <SegmentedControl
          value={scope}
          onValueChange={setScope}
          data={SCOPE_OPTIONS}
          aria-label="Skill scope"
        />
        <Select
          value={categoryId}
          onValueChange={setCategoryId}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((c) => ({ value: c.id, label: c.label })),
          ]}
          aria-label="Filter by category"
        />
        <Button variant="primary" icon={<Plus />} onClick={onNew}>
          New
        </Button>
        {isAdmin && onIngest && (
          <Button icon={<Upload />} onClick={onIngest} aria-label="Filesystem ingest" title="Filesystem ingest" />
        )}
        {isAdmin && onCategories && (
          <Button icon={<Settings />} onClick={onCategories} aria-label="Categories admin" title="Categories admin" />
        )}
      </ControlRow>

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
            <ErrorAlchemyMenu error={error} />
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
              {/* The row's click means "show this skill in the panel beside
                  me", so the label cannot be the anchor — an <a> inside a
                  <button> is invalid DOM. The doors ride as a SIBLING
                  (`EntityDoorControls`): a `skill` peek is registered, so
                  "which one is that?" is answerable without leaving, and the
                  admin console additionally supplies a new-tab route. */}
              {g.items.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group/entity-ref relative flex items-stretch",
                    "hover:bg-muted/40 transition-colors",
                    "border-b border-border/40 last:border-b-0",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="group flex flex-1 min-w-0 items-start gap-3 px-4 py-2.5 pr-16 text-left"
                  >
                    <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        {s.label}
                        <ScopeBadge skill={s} />
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {catalogProseText(s.description)}
                      </div>
                      <SkillAttributionLine skill={s} className="mt-0.5" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 font-mono pt-0.5 truncate max-w-[160px]">
                      {s.skillId}
                    </span>
                  </button>
                  <EntityDoorControls
                    token="skill"
                    id={s.id}
                    name={s.label}
                    href={skillHref ? skillHref(s.id) : null}
                    className="absolute right-2 top-2.5 rounded border border-border bg-card"
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: ReadonlyArray<{ value: ScopeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "system", label: "System" },
  { value: "public", label: "Public" },
  { value: "personal", label: "Personal" },
];

function ScopeBadge({ skill }: { skill: SkillRow }) {
  // System and imported rows get their origin from the ONE shared badge, so an
  // outside expert's skill never reads as "System" (written by AI Matrx).
  if (skill.isSystem || getSkillProvenance(skill).imported) {
    return <SkillOriginBadges skill={skill} size="sm" />;
  }
  return (
    <>
      {skill.isPublic ? (
        <Badge
          variant="outline"
          className="gap-1 px-1.5 h-4 text-[10px] font-normal"
        >
          <Globe2 className="h-2.5 w-2.5" />
          Public
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="gap-1 px-1.5 h-4 text-[10px] font-normal text-muted-foreground"
        >
          <UserRound className="h-2.5 w-2.5" />
          Personal
        </Badge>
      )}
      {/* Not-runnable warning only (no origin badge for a plain row). */}
      <SkillOriginBadges skill={skill} size="sm" />
    </>
  );
}
