"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  Search,
  Check,
  X,
  LayoutGrid,
  List,
  CornerDownRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  listTemplates,
  applyTemplate,
  selectAllTemplates,
  selectAllFlatScopeTypes,
  selectTemplatesLoaded,
  selectTemplatesLoading,
  selectTemplatesApplying,
  type ScopeTemplate,
  type FlatTemplateScopeType,
  type TemplateScopeType,
} from "@/features/scope-system/redux/templatesSlice";
import {
  createScopeType,
  fetchScopeTypes,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchScopes } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  createContextItem,
  listScopeTypeItems,
} from "@/features/scope-system/redux/contextItemsSlice";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";

interface TemplateGalleryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** Show only personal templates (for personal orgs). Default: show all. */
  personalOnly?: boolean;
  /** Which mode the drawer opens in. Default: "templates". */
  initialMode?: Mode;
  /** Called after a template (or single scope-type) is successfully applied. */
  onApplied?: () => void;
}

const ALL = "__all__";

type Mode = "templates" | "individual";

function humanizeCategory(c: string): string {
  return c
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// The same scope ("Client") appears across a dozen templates. For the
// "Individual scopes" mode — whose job is to TEACH the concept, not to
// exhaustively enumerate templates — we collapse duplicates to one row per
// scope name, keeping the richest example (most context items) so the learner
// sees a fully-fleshed-out scope. The most universally-understood scopes are
// pinned to the top so "Clients" is the first thing a new user meets.
const PINNED_SINGULARS = [
  "client",
  "customer",
  "department",
  "team",
  "project",
  "location",
  "region",
];

function dedupeAndPrioritize(
  list: FlatTemplateScopeType[],
): FlatTemplateScopeType[] {
  const best = new Map<string, FlatTemplateScopeType>();
  for (const item of list) {
    const key = item.label_singular.trim().toLowerCase();
    const current = best.get(key);
    if (!current) {
      best.set(key, item);
      continue;
    }
    // Prefer the richest example; break ties toward non-personal templates so
    // a professional "Client" wins over a personal one, then by template name
    // for stable ordering.
    const better =
      item.fields.length > current.fields.length ||
      (item.fields.length === current.fields.length &&
        !item.template_is_personal &&
        current.template_is_personal);
    if (better) best.set(key, item);
  }

  return Array.from(best.values()).sort((a, b) => {
    const ai = PINNED_SINGULARS.indexOf(a.label_singular.trim().toLowerCase());
    const bi = PINNED_SINGULARS.indexOf(b.label_singular.trim().toLowerCase());
    const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ar !== br) return ar - br;
    return a.label_plural.localeCompare(b.label_plural, undefined, {
      sensitivity: "base",
    });
  });
}

export function TemplateGalleryDrawer({
  open,
  onOpenChange,
  orgId,
  personalOnly,
  initialMode = "templates",
  onApplied,
}: TemplateGalleryDrawerProps) {
  const dispatch = useAppDispatch();
  const allTemplates = useAppSelector(selectAllTemplates);
  const allFlat = useAppSelector(selectAllFlatScopeTypes);
  const loading = useAppSelector(selectTemplatesLoading);
  const loaded = useAppSelector(selectTemplatesLoaded);
  const applying = useAppSelector(selectTemplatesApplying);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyingIndividualKey, setApplyingIndividualKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (open && !loaded) {
      dispatch(listTemplates(undefined));
    }
  }, [open, loaded, dispatch]);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
    } else {
      setSelectedId(null);
    }
  }, [open, initialMode]);

  const visibleTemplates = useMemo(() => {
    let list = allTemplates;
    if (personalOnly !== undefined) {
      list = list.filter((t) => t.is_personal === personalOnly);
    }
    if (category !== ALL) {
      list = list.filter((t) => t.category === category);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.scope_types.some((st) => st.label_plural.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allTemplates, personalOnly, category, query]);

  const visibleFlat = useMemo(() => {
    let list = allFlat;
    if (personalOnly !== undefined) {
      list = list.filter((s) => s.template_is_personal === personalOnly);
    }
    if (category !== ALL) {
      list = list.filter((s) => s.template_category === category);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.label_plural.toLowerCase().includes(q) ||
          s.label_singular.toLowerCase().includes(q) ||
          s.template_name.toLowerCase().includes(q) ||
          s.fields.some(
            (f) =>
              f.display_name.toLowerCase().includes(q) ||
              f.key.toLowerCase().includes(q),
          ),
      );
    }
    return dedupeAndPrioritize(list);
  }, [allFlat, personalOnly, category, query]);

  const categories = useMemo(() => {
    const base =
      personalOnly !== undefined
        ? allTemplates.filter((t) => t.is_personal === personalOnly)
        : allTemplates;
    const set = new Set<string>();
    for (const t of base) set.add(t.category);
    return Array.from(set).sort();
  }, [allTemplates, personalOnly]);

  const selected = visibleTemplates.find((t) => t.id === selectedId);

  async function handleApplyWhole(template: ScopeTemplate) {
    try {
      await dispatch(
        applyTemplate({ template_id: template.id, org_id: orgId }),
      ).unwrap();
      dispatch(fetchScopeTypes(orgId));
      dispatch(fetchScopes({ org_id: orgId }));
      toast.success(`Applied "${template.name}"`);
      setSelectedId(null);
      onOpenChange(false);
      onApplied?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to apply template",
      );
    }
  }

  /**
   * Apply a single scope-type from a template into the org. We bypass the
   * server-side `apply_template` RPC and instead loop through createScopeType
   * + createContextItem on the client because the RPC doesn't take a subset
   * argument. Parent-type wiring is dropped — if the template's scope has a
   * parent, the user re-assigns it via Edit later.
   */
  async function handleApplyIndividual(
    item:
      | FlatTemplateScopeType
      | (TemplateScopeType & { template_name: string; template_id: string }),
    keyForRow: string,
  ) {
    setApplyingIndividualKey(keyForRow);
    try {
      const newType = await dispatch(
        createScopeType({
          org_id: orgId,
          label_singular: item.label_singular,
          label_plural: item.label_plural,
          icon: item.icon || "Folder",
          max_assignments: item.max_assignments_per_entity ?? undefined,
        }),
      ).unwrap();
      for (const field of item.fields) {
        await dispatch(
          createContextItem({
            scope_type_id: newType.id,
            key: field.key,
            display_name: field.display_name,
          }),
        ).unwrap();
      }
      dispatch(listScopeTypeItems(newType.id));
      dispatch(fetchScopeTypes(orgId));
      dispatch(fetchScopes({ org_id: orgId }));
      toast.success(`Added "${item.label_plural}" from ${item.template_name}`);
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setApplyingIndividualKey(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Templates</SheetTitle>
          <SheetDescription>
            Pick a whole template or borrow individual scopes. Everything is
            editable after.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {/* Mode toggle */}
          <div className="inline-flex items-center gap-1 rounded-md border bg-card p-0.5">
            <ModeButton
              active={mode === "templates"}
              onClick={() => setMode("templates")}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              label="By template"
            />
            <ModeButton
              active={mode === "individual"}
              onClick={() => setMode("individual")}
              icon={<List className="h-3.5 w-3.5" />}
              label="Individual scopes"
            />
          </div>

          {/* Search + categories */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mode === "templates"
                    ? "Search templates"
                    : "Search scopes, source templates, fields"
                }
                className="pl-9"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CategoryChip
                label="All"
                active={category === ALL}
                onClick={() => setCategory(ALL)}
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c}
                  label={humanizeCategory(c)}
                  active={category === c}
                  onClick={() => setCategory(c)}
                />
              ))}
            </div>
          </div>

          {/* Body */}
          {loading && allTemplates.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : mode === "templates" && selected ? (
            <TemplateDetail
              template={selected}
              onBack={() => setSelectedId(null)}
              onApplyWhole={() => handleApplyWhole(selected)}
              onApplyOne={(st, key) =>
                handleApplyIndividual(
                  {
                    ...st,
                    template_id: selected.id,
                    template_name: selected.name,
                  },
                  key,
                )
              }
              wholeApplying={applying}
              individualApplyingKey={applyingIndividualKey}
            />
          ) : mode === "templates" ? (
            visibleTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No templates match.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onClick={() => setSelectedId(t.id)}
                  />
                ))}
              </div>
            )
          ) : visibleFlat.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No scopes match.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Add a single scope to start. {visibleFlat.length} common{" "}
                {visibleFlat.length === 1 ? "scope" : "scopes"} — the most
                widely-used first.
              </p>
              {visibleFlat.map((item, idx) => {
                const rowKey = `${item.template_id}:${item.label_plural}:${idx}`;
                return (
                  <FlatScopeRow
                    key={rowKey}
                    item={item}
                    busy={applyingIndividualKey === rowKey}
                    onApply={() => handleApplyIndividual(item, rowKey)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground border border-border"
      }`}
    >
      {label}
    </button>
  );
}

function TemplateCard({
  template,
  onClick,
}: {
  template: ScopeTemplate;
  onClick: () => void;
}) {
  const Icon = resolveIcon(template.icon);
  const visibleScopes = template.scope_types.slice(0, 3);
  const scopeOverflow = Math.max(0, template.scope_types.length - 3);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="p-4 cursor-pointer hover:border-primary/30 hover:bg-accent/30 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="text-muted-foreground shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground line-clamp-1">
            {template.name}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {template.description}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {visibleScopes.map((st) => (
              <Badge
                key={st.label_plural}
                variant="secondary"
                className="text-[10px]"
              >
                {st.label_plural}
              </Badge>
            ))}
            {scopeOverflow > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                +{scopeOverflow} more
              </Badge>
            )}
            {template.is_personal && (
              <Badge variant="outline" className="text-[10px]">
                Personal
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FlatScopeRow({
  item,
  busy,
  onApply,
}: {
  item: FlatTemplateScopeType;
  busy: boolean;
  onApply: () => void;
}) {
  const Icon = resolveIcon(item.icon);
  const previewFields = item.fields.slice(0, 3);
  const overflow = Math.max(0, item.fields.length - previewFields.length);
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">
              {item.label_plural}
            </p>
            <span className="text-xs text-muted-foreground">
              from {item.template_name}
            </span>
            {item.template_is_personal && (
              <Badge variant="outline" className="text-[10px]">
                Personal
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.fields.length}{" "}
            {item.fields.length === 1 ? "context item" : "context items"}
            {item.max_assignments_per_entity != null && (
              <> · max {item.max_assignments_per_entity} per record</>
            )}
          </p>
          {item.parent_type_label && (
            <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
              <CornerDownRight className="h-2.5 w-2.5" />
              usually under {item.parent_type_label} — will be added flat; wire
              it up later
            </p>
          )}
          {previewFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {previewFields.map((f) => (
                <Badge
                  key={f.key}
                  variant="outline"
                  className="text-[10px] font-normal"
                >
                  {f.display_name}
                </Badge>
              ))}
              {overflow > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{overflow} more
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onApply}
          disabled={busy}
          className="shrink-0"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Add</>}
        </Button>
      </div>
    </Card>
  );
}

function TemplateDetail({
  template,
  onBack,
  onApplyWhole,
  onApplyOne,
  wholeApplying,
  individualApplyingKey,
}: {
  template: ScopeTemplate;
  onBack: () => void;
  onApplyWhole: () => void;
  onApplyOne: (st: TemplateScopeType, key: string) => void;
  wholeApplying: boolean;
  individualApplyingKey: string | null;
}) {
  const Icon = resolveIcon(template.icon);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <X className="h-4 w-4 mr-1" />
        Back to gallery
      </Button>

      <div className="flex items-start gap-3">
        <div className="text-foreground shrink-0">
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{template.name}</h3>
          <p className="text-sm text-muted-foreground">
            {template.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="secondary" className="text-[10px]">
              {humanizeCategory(template.category)}
            </Badge>
            {template.is_personal && (
              <Badge variant="outline" className="text-[10px]">
                Personal
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          What gets created
        </p>
        <div className="space-y-2">
          {template.scope_types.map((st, idx) => {
            const StIcon = resolveIcon(st.icon);
            const rowKey = `${template.id}:detail:${idx}`;
            const busy = individualApplyingKey === rowKey;
            return (
              <Card key={`${st.label_plural}-${idx}`} className="p-3">
                <div className="flex items-start gap-3">
                  <StIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{st.label_plural}</p>
                    <p className="text-xs text-muted-foreground">
                      {st.fields.length}{" "}
                      {st.fields.length === 1
                        ? "context item"
                        : "context items"}
                      {st.max_assignments_per_entity != null && (
                        <> · max {st.max_assignments_per_entity} per record</>
                      )}
                    </p>
                    {st.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {st.fields.slice(0, 3).map((f) => (
                          <Badge
                            key={f.key}
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {f.display_name}
                          </Badge>
                        ))}
                        {st.fields.length > 3 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            +{st.fields.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onApplyOne(st, rowKey)}
                    disabled={busy || wholeApplying}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Add just this scope"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Add just this"
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={wholeApplying}>
          Cancel
        </Button>
        <Button
          onClick={onApplyWhole}
          disabled={wholeApplying}
          className="flex-1"
        >
          {wholeApplying ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Use whole template
        </Button>
      </div>
    </div>
  );
}
