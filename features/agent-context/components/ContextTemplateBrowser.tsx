"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Code2,
  Search,
  Users,
  Scale,
  Shield,
  Heart,
  ShoppingBag,
  Store,
  Brain,
  Globe,
  ChevronRight,
  Cpu,
  Building2,
  FolderKanban,
  ListTodo,
  User,
  Tag,
  Folder,
} from "lucide-react";
import * as icons from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "../redux/scope/scopeTypesSlice";
import { fetchScopes, selectScopesByType } from "../redux/scope/scopesSlice";
import {
  EMPTY_SCOPES_LIST,
  EMPTY_SCOPE_TYPES_LIST,
} from "../redux/scope/selectors";
import { selectOrganizationId } from "../redux/appContextSlice";
import {
  useContextTemplates,
  useApplyTemplate,
} from "../hooks/useContextItems";
import { contextService } from "../service/contextService";
import { INDUSTRY_CATEGORIES } from "../constants";
import type { ContextTemplate, ContextScopeLevel } from "../types";
import type { ScopeState } from "../hooks/useContextScope";

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascalName];
  return Icon ?? Folder;
}

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Globe,
  Code2,
  Search,
  Users,
  Scale,
  Shield,
  Heart,
  ShoppingBag,
  Store,
  Brain,
};

const SCOPE_ICONS: Record<string, LucideIcon> = {
  user: User,
  organization: Building2,
  project: FolderKanban,
  task: ListTodo,
  scope: Tag,
};

type Props = {
  scope: ScopeState;
};

export function ContextTemplateBrowser({ scope }: Props) {
  const { data: templates, isLoading } = useContextTemplates();
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [applyDialog, setApplyDialog] = useState<{
    industry: string;
    items: ContextTemplate[];
  } | null>(null);
  const [applyTarget, setApplyTarget] = useState<ScopeState>(scope);
  const orgId = useAppSelector(selectOrganizationId);
  const applyMutation = useApplyTemplate(
    applyTarget.scopeType,
    applyTarget.scopeId,
  );
  const router = useRouter();

  const grouped = useMemo(() => {
    if (!templates) return new Map<string, ContextTemplate[]>();
    const map = new Map<string, ContextTemplate[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [templates]);

  const detailItems = selectedIndustry
    ? (grouped.get(selectedIndustry) ?? [])
    : [];

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  // ─── Detail view ──────────────────────────────
  if (selectedIndustry) {
    const industry = INDUSTRY_CATEGORIES.find(
      (c) => c.key === selectedIndustry,
    );
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setSelectedIndustry(null)}
          >
            &larr; All Templates
          </Button>
          <h2 className="text-sm font-semibold">
            {industry?.label ?? selectedIndustry}
          </h2>
          <Badge variant="outline" className="text-[10px]">
            {detailItems.length} items
          </Badge>
        </div>

        <div className="space-y-2">
          {detailItems.map((item) => (
            <Card key={item.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold">{item.name}</h3>
                    <code className="text-[10px] font-mono text-muted-foreground">
                      {item.key}
                    </code>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.description || "—"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="h-4 text-[9px]">
                      Template package
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          size="sm"
          className="text-xs"
          onClick={() =>
            setApplyDialog({ industry: selectedIndustry, items: detailItems })
          }
        >
          Apply to {scope.scopeName} &rarr;
        </Button>
      </div>
    );
  }

  // ─── Grid view ────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Industry Templates</h2>
        <p className="text-xs text-muted-foreground">
          Start fast — pick a template to bootstrap your context library
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {INDUSTRY_CATEGORIES.map((cat) => {
          const items = grouped.get(cat.key) ?? [];
          if (items.length === 0) return null;
          const Icon = INDUSTRY_ICONS[cat.iconName] ?? Globe;
          const requiredCount = 0;
          const examples = items.slice(0, 3).map((i) => i.name);

          return (
            <Card
              key={cat.key}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSelectedIndustry(cat.key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">{cat.label}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {items.length} items &middot; {requiredCount} required
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {examples.map((ex) => (
                    <Badge
                      key={ex}
                      variant="outline"
                      className="h-4 text-[9px] px-1"
                    >
                      {ex}
                    </Badge>
                  ))}
                  {items.length > 3 && (
                    <Badge variant="outline" className="h-4 text-[9px] px-1">
                      +{items.length - 3} more
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-end mt-3 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                  >
                    Preview <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApplyDialog({ industry: cat.key, items });
                    }}
                  >
                    Apply &rarr;
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Apply dialog — multi-step */}
      {applyDialog && (
        <ApplyTemplateDialog
          items={applyDialog.items}
          scope={scope}
          onApply={(selectedItems, targetScope) => {
            setApplyTarget(targetScope);
            applyMutation.mutate(selectedItems, {
              onSuccess: () => {
                setApplyDialog(null);
                router.push("/agent-context?tab=items");
              },
            });
          }}
          onClose={() => setApplyDialog(null)}
          isPending={applyMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Multi-step Apply Dialog ─────────────────────────────────────

type ApplyStep = "scope" | "items" | "confirm";

function ApplyTemplateDialog({
  items,
  scope,
  onApply,
  onClose,
  isPending,
}: {
  items: ContextTemplate[];
  scope: ScopeState;
  onApply: (selectedItems: ContextTemplate[], targetScope: ScopeState) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectOrganizationId);
  const scopeTypes = useAppSelector((state) =>
    orgId ? selectScopeTypesByOrg(state, orgId) : EMPTY_SCOPE_TYPES_LIST,
  );
  const scopeTypesLoading = useAppSelector(selectScopeTypesLoading);

  const [step, setStep] = useState<ApplyStep>("scope");
  const [selectedScope, setSelectedScope] = useState(scope);
  const [selectedScopeTypeId, setSelectedScopeTypeId] = useState<string | null>(
    null,
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [loadingKeys, setLoadingKeys] = useState(false);

  const scopeInstances = useAppSelector((state) =>
    selectedScopeTypeId
      ? selectScopesByType(state, selectedScopeTypeId)
      : EMPTY_SCOPES_LIST,
  );

  useEffect(() => {
    if (orgId) {
      dispatch(fetchScopeTypes(orgId));
      dispatch(fetchScopes({ org_id: orgId }));
    }
  }, [dispatch, orgId]);

  const required: ContextTemplate[] = [];
  const optional = items;
  const selectedItems = items.filter((i) => checkedIds.has(i.id));
  const toCreate = selectedItems.filter((i) => !existingKeys.has(i.key));
  const toSkip = selectedItems.filter((i) => existingKeys.has(i.key));

  useEffect(() => {
    if (step === "confirm") {
      setLoadingKeys(true);
      contextService
        .fetchExistingKeys(selectedScope.scopeType, selectedScope.scopeId)
        .then((keys) => setExistingKeys(keys))
        .finally(() => setLoadingKeys(false));
    }
  }, [step, selectedScope]);

  const recommendedScope = scope.scopeType;

  const toggle = (id: string, isRequired: boolean) => {
    if (isRequired) return;
    const next = new Set(checkedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setCheckedIds(next);
  };

  const fixedLevels: ContextScopeLevel[] = [
    "user",
    "organization",
    "project",
    "task",
  ];

  const canProceedFromScope =
    selectedScope.scopeType !== "scope" ||
    (selectedScope.scopeType === "scope" &&
      selectedScope.scopeId &&
      selectedScope.scopeId !== "default");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {step === "scope" && "Step 1: Choose Scope"}
            {step === "items" && "Step 2: Choose Items"}
            {step === "confirm" && "Step 3: Confirm"}
          </DialogTitle>
          <div className="flex gap-1 mt-2">
            {(["scope", "items", "confirm"] as ApplyStep[]).map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full ${step === s ? "bg-primary" : i < (["scope", "items", "confirm"] as ApplyStep[]).indexOf(step) ? "bg-primary/40" : "bg-muted"}`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="py-2">
          {/* Step 1: Scope */}
          {step === "scope" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Select where to create these context items
              </p>

              {fixedLevels.map((s) => {
                const Icon = SCOPE_ICONS[s] ?? Tag;
                const isRecommended = s === recommendedScope;
                const isSelected = selectedScope.scopeType === s;
                return (
                  <button
                    key={s}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${isSelected ? "border-primary/30 bg-primary/5 ring-1 ring-primary/10" : "border-border hover:bg-muted"}`}
                    onClick={() => {
                      setSelectedScope({ ...scope, scopeType: s });
                      setSelectedScopeTypeId(null);
                    }}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium capitalize">{s}</p>
                      {s === scope.scopeType && (
                        <p className="text-[10px] text-muted-foreground">
                          {scope.scopeName}
                        </p>
                      )}
                    </div>
                    {isRecommended && (
                      <Badge
                        variant="secondary"
                        className="h-4 text-[9px] px-1 shrink-0"
                      >
                        Recommended
                      </Badge>
                    )}
                  </button>
                );
              })}

              {/* Dynamic scope types from org */}
              {scopeTypesLoading && <Skeleton className="h-12 rounded-lg" />}
              {scopeTypes.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">
                    Scopes
                  </p>
                  {scopeTypes.map((st) => {
                    const ScopeIcon = resolveIcon(st.icon);
                    const isTypeSelected = selectedScopeTypeId === st.id;
                    return (
                      <div key={st.id} className="space-y-1">
                        <button
                          className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${isTypeSelected ? "border-primary/30 bg-primary/5 ring-1 ring-primary/10" : "border-border hover:bg-muted"}`}
                          onClick={() => {
                            setSelectedScopeTypeId(st.id);
                            setSelectedScope({
                              scopeType: "scope",
                              scopeId: "",
                              scopeName: "",
                              scopeTypeId: st.id,
                              scopeColor: st.color,
                              scopeIcon: st.icon,
                            });
                          }}
                        >
                          <ScopeIcon
                            className="h-4 w-4 shrink-0"
                            style={{ color: st.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">
                              {st.label_singular}
                            </p>
                            {st.description && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {st.description}
                              </p>
                            )}
                          </div>
                          {recommendedScope === "scope" && (
                            <Badge
                              variant="secondary"
                              className="h-4 text-[9px] px-1 shrink-0"
                            >
                              Recommended
                            </Badge>
                          )}
                        </button>

                        {isTypeSelected && scopeInstances.length > 0 && (
                          <ScrollArea className="max-h-40 ml-6">
                            <div className="space-y-0.5 py-1">
                              {scopeInstances.map((si) => (
                                <button
                                  key={si.id}
                                  className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-all ${selectedScope.scopeId === si.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"}`}
                                  onClick={() =>
                                    setSelectedScope({
                                      scopeType: "scope",
                                      scopeId: si.id,
                                      scopeName: si.name,
                                      scopeTypeId: st.id,
                                      scopeColor: st.color,
                                      scopeIcon: st.icon,
                                    })
                                  }
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: st.color }}
                                  />
                                  {si.name}
                                </button>
                              ))}
                            </div>
                          </ScrollArea>
                        )}

                        {isTypeSelected && scopeInstances.length === 0 && (
                          <p className="ml-6 text-[10px] text-muted-foreground py-1">
                            No {st.label_plural.toLowerCase()} defined yet
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Items */}
          {step === "items" && (
            <div className="space-y-3">
              <button
                type="button"
                className="w-full flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5 text-left hover:bg-purple-500/10 transition-colors"
              >
                <Cpu className="h-4 w-4 text-purple-500 shrink-0" />
                <div>
                  <p className="text-xs font-medium">AI Pre-fill Suggestions</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pre-populate values using available context
                  </p>
                </div>
              </button>

              {required.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">
                    Required ({required.length})
                  </p>
                  {required.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <Checkbox checked disabled />
                      <span className="text-xs">{item.name}</span>
                      <Badge
                        variant="outline"
                        className="h-4 text-[9px] ml-auto font-mono"
                      >
                        {item.key}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {optional.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5">
                    Optional ({optional.length})
                  </p>
                  {optional.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        checked={checkedIds.has(item.id)}
                        onCheckedChange={() => toggle(item.id, false)}
                      />
                      <span className="text-xs">{item.name}</span>
                      <Badge
                        variant="outline"
                        className="h-4 text-[9px] ml-auto font-mono"
                      >
                        {item.key}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && (
            <div className="space-y-3">
              {loadingKeys ? (
                <Skeleton className="h-20" />
              ) : (
                <>
                  <p className="text-xs">
                    Creating{" "}
                    <span className="font-semibold">{toCreate.length}</span>{" "}
                    context items in{" "}
                    <span className="font-semibold capitalize">
                      {selectedScope.scopeType === "scope"
                        ? selectedScope.scopeName
                        : `${selectedScope.scopeType}: ${selectedScope.scopeName}`}
                    </span>
                  </p>
                  {toCreate.length > 0 && (
                    <div className="space-y-0.5">
                      {toCreate.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 py-0.5"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                          <span className="text-xs">{item.name}</span>
                          <code className="text-[9px] font-mono text-muted-foreground ml-auto">
                            {item.key}
                          </code>
                        </div>
                      ))}
                    </div>
                  )}
                  {toSkip.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">
                        Already exists — will skip:
                      </p>
                      <div className="space-y-0.5 opacity-50">
                        {toSkip.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 py-0.5"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            <span className="text-xs line-through">
                              {item.name}
                            </span>
                            <code className="text-[9px] font-mono text-muted-foreground ml-auto">
                              {item.key}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== "scope" && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs mr-auto"
              onClick={() => setStep(step === "confirm" ? "items" : "scope")}
            >
              &larr; Back
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          {step === "confirm" ? (
            <Button
              size="sm"
              className="text-xs"
              onClick={() => onApply(selectedItems, selectedScope)}
              disabled={isPending || loadingKeys}
            >
              {isPending ? "Applying..." : `Create ${toCreate.length} Items`}
            </Button>
          ) : (
            <Button
              size="sm"
              className="text-xs"
              onClick={() => setStep(step === "scope" ? "items" : "confirm")}
              disabled={step === "scope" && !canProceedFromScope}
            >
              Next &rarr;
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
