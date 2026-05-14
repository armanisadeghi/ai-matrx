"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Search, Check, Sparkles, X } from "lucide-react";
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
  selectTemplatesLoaded,
  selectTemplatesLoading,
  selectTemplatesApplying,
  type ScopeTemplate,
} from "@/features/scope-system/redux/templatesSlice";
import { fetchScopeTypes } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchScopes } from "@/features/agent-context/redux/scope/scopesSlice";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";

interface TemplateGalleryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** Show only personal templates (for personal orgs). Default: show all. */
  personalOnly?: boolean;
  /** Called after a template is successfully applied. */
  onApplied?: () => void;
}

const INPUT_NO_ZOOM: React.CSSProperties = { fontSize: "16px" };
const ALL = "__all__";

function humanizeCategory(c: string): string {
  return c
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function TemplateGalleryDrawer({
  open,
  onOpenChange,
  orgId,
  personalOnly,
  onApplied,
}: TemplateGalleryDrawerProps) {
  const dispatch = useAppDispatch();
  const allTemplates = useAppSelector(selectAllTemplates);
  const loading = useAppSelector(selectTemplatesLoading);
  const loaded = useAppSelector(selectTemplatesLoaded);
  const applying = useAppSelector(selectTemplatesApplying);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open && !loaded) {
      dispatch(listTemplates(undefined));
    }
  }, [open, loaded, dispatch]);

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
          t.scope_types.some((st) =>
            st.label_plural.toLowerCase().includes(q),
          ),
      );
    }
    return list;
  }, [allTemplates, personalOnly, category, query]);

  const categories = useMemo(() => {
    const base = personalOnly !== undefined
      ? allTemplates.filter((t) => t.is_personal === personalOnly)
      : allTemplates;
    const set = new Set<string>();
    for (const t of base) set.add(t.category);
    return Array.from(set).sort();
  }, [allTemplates, personalOnly]);

  const selected = visibleTemplates.find((t) => t.id === selectedId);

  async function handleApply(template: ScopeTemplate) {
    try {
      await dispatch(
        applyTemplate({ template_id: template.id, org_id: orgId }),
      ).unwrap();
      // Refresh local data so the new scope types and scopes appear immediately
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Templates</SheetTitle>
          <SheetDescription>
            Pick a template to scaffold scopes and context items. Everything is
            editable after.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {/* Search + categories */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="pl-9"
                style={INPUT_NO_ZOOM}
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
          ) : selected ? (
            <TemplateDetail
              template={selected}
              onBack={() => setSelectedId(null)}
              onApply={() => handleApply(selected)}
              applying={applying}
            />
          ) : visibleTemplates.length === 0 ? (
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
          )}
        </div>
      </SheetContent>
    </Sheet>
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
  const totalFields = template.scope_types.reduce(
    (sum, st) => sum + (st.field_count ?? st.fields.length ?? 0),
    0,
  );
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
            <Badge variant="secondary" className="text-[10px]">
              {template.scope_types.length}{" "}
              {template.scope_types.length === 1 ? "scope" : "scopes"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {totalFields} context items
            </Badge>
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

function TemplateDetail({
  template,
  onBack,
  onApply,
  applying,
}: {
  template: ScopeTemplate;
  onBack: () => void;
  onApply: () => void;
  applying: boolean;
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
            return (
              <Card key={`${st.label_plural}-${idx}`} className="p-3">
                <div className="flex items-start gap-3">
                  <StIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{st.label_plural}</p>
                    <p className="text-xs text-muted-foreground">
                      {st.fields.length}{" "}
                      {st.fields.length === 1 ? "context item" : "context items"}
                      {st.max_assignments_per_entity != null && (
                        <> · max {st.max_assignments_per_entity} per record</>
                      )}
                    </p>
                    {st.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {st.fields.map((f) => (
                          <Badge
                            key={f.key}
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {f.display_name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={applying}>
          Cancel
        </Button>
        <Button onClick={onApply} disabled={applying} className="flex-1">
          {applying ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Use this template
        </Button>
      </div>
    </div>
  );
}
