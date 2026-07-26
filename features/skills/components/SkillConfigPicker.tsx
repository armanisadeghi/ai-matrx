"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Folder,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { filterAndSortBySearch } from "@/utils/search-scoring";

import { useSkillCategories } from "../hooks/useSkillCategories";
import { useSkills } from "../hooks/useSkills";
import type { CategoryRow, SkillConfig, SkillRow } from "../types";
import { SkillDetailView } from "./SkillDetailView";
import {
  SKILL_TIER_META,
  SKILL_TIER_ORDER,
  type SkillTierKey,
} from "./skill-tiers";

type Tier = SkillTierKey;
type CatalogueFilter = "all" | "configured" | "unassigned";

interface SkillConfigPickerProps {
  /** Current value — never null; pass the empty default if absent. */
  value: SkillConfig;
  /** Called with the next value whenever a skill moves tier or the global
   * disable switch changes. The container owns Redux + dirty tracking. */
  onChange: (next: SkillConfig) => void;
  disabled?: boolean;
}

const TIER_META = SKILL_TIER_META;
const TIER_ORDER = SKILL_TIER_ORDER;
const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

/** Large-catalogue editor for an agent's three skill assignment tiers. */
export function SkillConfigPicker({
  value,
  onChange,
  disabled = false,
}: SkillConfigPickerProps) {
  const { skills, loading, error } = useSkills();
  const { categories } = useSkillCategories();
  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [catalogueFilter, setCatalogueFilter] =
    React.useState<CatalogueFilter>("all");
  /** Skill whose full instructions are being read. Null → review pane. */
  const [detailSkillId, setDetailSkillId] = React.useState<string | null>(null);

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const tierBySkillId = new Map<string, Tier>();
  for (const tier of TIER_ORDER) {
    for (const id of value[tier]) tierBySkillId.set(id, tier);
  }

  const categoryOptions = buildCategoryOptions(categories);
  const skillCountByCategory = new Map(
    categories.map((category) => {
      const categoryIds = collectCategoryDescendantIds(category.id, categories);
      return [
        category.id,
        skills.filter(
          (skill) => skill.categoryId && categoryIds.has(skill.categoryId),
        ).length,
      ] as const;
    }),
  );
  const selectedCategoryIds = categoryId
    ? categoryId === UNCATEGORIZED_CATEGORY_ID
      ? null
      : collectCategoryDescendantIds(categoryId, categories)
    : null;

  let visibleSkills = skills.filter((skill) => {
    if (categoryId === UNCATEGORIZED_CATEGORY_ID && skill.categoryId !== null) {
      return false;
    }
    if (
      selectedCategoryIds &&
      (!skill.categoryId || !selectedCategoryIds.has(skill.categoryId))
    ) {
      return false;
    }
    const tier = tierBySkillId.get(skill.id);
    if (catalogueFilter === "configured") return tier !== undefined;
    if (catalogueFilter === "unassigned") return tier === undefined;
    return true;
  });

  if (search.trim()) {
    visibleSkills = filterAndSortBySearch(visibleSkills, search, [
      { get: (skill) => skill.label, weight: "title" },
      { get: (skill) => skill.skillId, weight: "subtitle" },
      { get: (skill) => skill.description, weight: "body" },
      {
        get: (skill) =>
          skill.categoryId
            ? categoryById.get(skill.categoryId)?.label
            : undefined,
        weight: "tag",
      },
      { get: (skill) => skill.skillType, weight: "meta" },
    ]);
  }

  const move = (skillId: string, target: Tier | null) => {
    const next: SkillConfig = {
      included: value.included.filter((id) => id !== skillId),
      listed: value.listed.filter((id) => id !== skillId),
      forbidden: value.forbidden.filter((id) => id !== skillId),
      disabled: value.disabled,
    };
    if (target) next[target] = [...next[target], skillId];
    onChange(next);
  };

  const totalConfigured =
    value.included.length + value.listed.length + value.forbidden.length;
  const assignmentDisabled = disabled || value.disabled;

  // The detail pane is driven by id, not by the row object, so it survives a
  // catalogue refetch (skills reload on every sandbox auto-discovery event).
  const detailSkill = detailSkillId ? skillById.get(detailSkillId) : undefined;
  const detailPane = detailSkill ? (
    <SkillDetailView
      skill={detailSkill}
      categoryLabel={
        detailSkill.categoryId
          ? categoryById.get(detailSkill.categoryId)?.label
          : undefined
      }
      tier={tierBySkillId.get(detailSkill.id) ?? null}
      onMove={(target) => move(detailSkill.id, target)}
      onBack={() => setDetailSkillId(null)}
      disabled={assignmentDisabled}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Switch
            id="disable-agent-skills"
            checked={!value.disabled}
            onCheckedChange={(checked) =>
              onChange({ ...value, disabled: !checked })
            }
            disabled={disabled}
          />
          <div className="min-w-0">
            <Label
              htmlFor="disable-agent-skills"
              className="text-sm font-medium"
            >
              Skills enabled
            </Label>
            <p className="text-xs text-muted-foreground">
              Turn off to suppress all skill discovery and injection for this
              agent without losing the configuration.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span>{skills.length} available</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-foreground">
            {totalConfigured} configured
          </span>
        </div>
      </div>

      <div
        className={cn(
          "relative grid min-h-0 flex-1 grid-cols-1",
          detailPane
            ? "lg:grid-cols-[220px_minmax(0,1fr)_minmax(380px,460px)]"
            : "lg:grid-cols-[220px_minmax(0,1fr)_320px]",
          assignmentDisabled && "opacity-65",
        )}
      >
        <aside className="hidden min-h-0 border-r border-border bg-muted/10 lg:flex lg:flex-col">
          <div className="shrink-0 px-3 pb-2 pt-4">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categories
            </p>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
            <CategoryButton
              label="All skills"
              count={skills.length}
              selected={categoryId === null}
              onClick={() => setCategoryId(null)}
            />
            <CategoryButton
              label="Uncategorized"
              count={skills.filter((skill) => !skill.categoryId).length}
              selected={categoryId === UNCATEGORIZED_CATEGORY_ID}
              onClick={() => setCategoryId(UNCATEGORIZED_CATEGORY_ID)}
            />
            {categoryOptions.map(({ category, depth }) => (
              <CategoryButton
                key={category.id}
                label={category.label}
                count={skillCountByCategory.get(category.id) ?? 0}
                selected={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                depth={depth}
              />
            ))}
          </ScrollArea>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by skill name, description, category, type, or ID…"
                className="h-10 pl-9 pr-9"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear skill search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {(
                [
                  ["all", "All"],
                  ["configured", "Configured"],
                  ["unassigned", "Unassigned"],
                ] satisfies Array<[CatalogueFilter, string]>
              ).map(([filter, label]) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={catalogueFilter === filter ? "secondary" : "ghost"}
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => setCatalogueFilter(filter)}
                >
                  {label}
                </Button>
              ))}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {visibleSkills.length} result
                {visibleSkills.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 lg:hidden">
              <Button
                type="button"
                size="sm"
                variant={categoryId === null ? "secondary" : "ghost"}
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setCategoryId(null)}
              >
                All categories
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  categoryId === UNCATEGORIZED_CATEGORY_ID
                    ? "secondary"
                    : "ghost"
                }
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setCategoryId(UNCATEGORIZED_CATEGORY_ID)}
              >
                Uncategorized
              </Button>
              {categoryOptions.map(({ category }) => (
                <Button
                  key={category.id}
                  type="button"
                  size="sm"
                  variant={categoryId === category.id ? "secondary" : "ghost"}
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.label}
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {loading && skills.length === 0 ? (
              <EmptyCatalogue message="Loading skills…" />
            ) : error ? (
              <EmptyCatalogue message={`Could not load skills: ${error}`} />
            ) : visibleSkills.length === 0 ? (
              <EmptyCatalogue message="No skills match these filters." />
            ) : (
              <div className="divide-y divide-border">
                {visibleSkills.map((skill) => (
                  <SkillCatalogueRow
                    key={skill.id}
                    skill={skill}
                    categoryLabel={
                      skill.categoryId
                        ? categoryById.get(skill.categoryId)?.label
                        : undefined
                    }
                    tier={tierBySkillId.get(skill.id) ?? null}
                    onMove={(target) => move(skill.id, target)}
                    onOpen={() => setDetailSkillId(skill.id)}
                    isOpen={detailSkillId === skill.id}
                    disabled={assignmentDisabled}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </main>

        {/* `min-w-0` is load-bearing: the detail pane renders markdown whose
            intrinsic width (code fences, long tokens) would otherwise blow the
            grid column past its max and clip against the window edge. */}
        <aside className="hidden min-h-0 min-w-0 overflow-hidden bg-muted/5 lg:flex lg:flex-col">
          {detailPane ?? (
            <>
              <div className="shrink-0 border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Agent configuration</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Review everything assigned without losing your search
                  position.
                </p>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-5 p-4">
                  {TIER_ORDER.map((tier) => (
                    <SelectedTier
                      key={tier}
                      tier={tier}
                      ids={value[tier]}
                      skillById={skillById}
                      onSelect={(id) => setDetailSkillId(id)}
                      onRemove={(id) => move(id, null)}
                      disabled={assignmentDisabled}
                    />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </aside>

        {/* Below `lg` the review/detail column is collapsed away, so the
            detail takes over the whole picker body instead of being
            unreachable. */}
        {detailPane && (
          <div className="absolute inset-0 z-20 lg:hidden">{detailPane}</div>
        )}
      </div>
    </div>
  );
}

function CategoryButton({
  label,
  count,
  selected,
  onClick,
  depth = 0,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  depth?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs transition-colors",
        selected
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <Folder className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[10px] opacity-70">
        {count}
      </span>
    </button>
  );
}

function SkillCatalogueRow({
  skill,
  categoryLabel,
  tier,
  onMove,
  onOpen,
  isOpen,
  disabled,
}: {
  skill: SkillRow;
  categoryLabel?: string;
  tier: Tier | null;
  onMove: (tier: Tier | null) => void;
  /** Opens the read-only detail pane for this skill. */
  onOpen: () => void;
  isOpen: boolean;
  disabled: boolean;
}) {
  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors hover:bg-muted/25",
        isOpen && "bg-accent/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {/* The whole text block is the "read this skill" affordance —
            assignment stays on the explicit tier buttons to the right. */}
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={isOpen}
          title={`Open ${skill.label}`}
          className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h4 className="truncate text-sm font-medium text-foreground group-hover:underline">
              {skill.label}
            </h4>
            {skill.isSystem && (
              <Badge
                variant="outline"
                className="h-5 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                <ShieldCheck className="h-3 w-3" />
                System
              </Badge>
            )}
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
              <FileText className="h-3 w-3" />
              View
              <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {skill.description || "No description provided."}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
            {categoryLabel && <span>{categoryLabel}</span>}
            {categoryLabel && <span aria-hidden="true">·</span>}
            <span>{skill.skillType}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{skill.skillId}</span>
          </div>
        </button>

        <div
          className="grid shrink-0 grid-cols-4 gap-1"
          aria-label={`Assignment for ${skill.label}`}
        >
          {TIER_ORDER.map((candidate) => {
            const meta = TIER_META[candidate];
            const Icon = meta.icon;
            const active = tier === candidate;
            return (
              <button
                key={candidate}
                type="button"
                onClick={() => onMove(candidate)}
                disabled={disabled}
                aria-pressed={active}
                title={`${meta.label}: ${meta.hint}`}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
                  active
                    ? meta.activeClass
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                  disabled && "cursor-not-allowed",
                )}
              >
                {active ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                <span className="hidden xl:inline">{meta.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onMove(null)}
            disabled={disabled || tier === null}
            title="Remove assignment"
            aria-label={`Remove ${skill.label} from this agent`}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md border border-transparent px-2 text-muted-foreground transition-colors",
              tier
                ? "hover:border-border hover:bg-accent hover:text-foreground"
                : "opacity-25",
              disabled && "cursor-not-allowed",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectedTier({
  tier,
  ids,
  skillById,
  onSelect,
  onRemove,
  disabled,
}: {
  tier: Tier;
  ids: string[];
  skillById: Map<string, SkillRow>;
  /** Opens the read-only detail pane for the clicked skill. */
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide">
          {meta.label}
        </h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {ids.length}
        </span>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
        {meta.hint}
      </p>
      {ids.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground/70">
          Nothing assigned.
        </p>
      ) : (
        <div className="space-y-1">
          {ids.map((id) => {
            const skill = skillById.get(id);
            return (
              <div
                key={id}
                className="group flex items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-1.5"
                title={skill?.description ?? id}
              >
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  disabled={!skill}
                  className="min-w-0 flex-1 truncate rounded-sm text-left text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:no-underline"
                >
                  {skill?.label ?? `Unknown skill ${id.slice(0, 8)}`}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={disabled}
                  className="rounded-sm text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed"
                  aria-label={`Remove ${skill?.label ?? id}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyCatalogue({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/**
 * Flattens the category tree for a compact navigable sidebar while preserving
 * orphaned categories instead of silently hiding them.
 */
export function buildCategoryOptions(
  categories: CategoryRow[],
): Array<{ category: CategoryRow; depth: number }> {
  const childrenByParent = new Map<string | null, CategoryRow[]>();
  for (const category of categories) {
    const parentId =
      category.parentCategoryId &&
      categories.some((candidate) => candidate.id === category.parentCategoryId)
        ? category.parentCategoryId
        : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(category);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
  }

  const result: Array<{ category: CategoryRow; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const category of childrenByParent.get(parentId) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      result.push({ category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  // Keep malformed cycles visible so the category editor can repair them.
  for (const category of categories) {
    if (visited.has(category.id)) continue;
    visited.add(category.id);
    result.push({ category, depth: 0 });
    visit(category.id, 1);
  }
  return result;
}

/** Returns a category and every nested descendant for parent-category filtering. */
export function collectCategoryDescendantIds(
  categoryId: string,
  categories: CategoryRow[],
): Set<string> {
  const ids = new Set([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (
        category.parentCategoryId &&
        ids.has(category.parentCategoryId) &&
        !ids.has(category.id)
      ) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return ids;
}
