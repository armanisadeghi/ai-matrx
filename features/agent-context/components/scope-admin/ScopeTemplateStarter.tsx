"use client";

import { useState } from "react";
import * as icons from "lucide-react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Globe,
  Loader2,
  Stars,
  Code2,
  Search,
  Users,
  Scale,
  Shield,
  Heart,
  ShoppingBag,
  Store,
  Brain,
  Folder,
  PenLine,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createScopeType,
  selectScopeTypesByOrg,
} from "../../redux/scope/scopeTypesSlice";
import { createScope } from "../../redux/scope/scopesSlice";
import { INDUSTRY_CATEGORIES } from "../../constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { cn } from "@/utils/cn";

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return (icons as unknown as Record<string, LucideIcon>)[pascalName] ?? Folder;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const INDUSTRY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
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
  PenLine,
};

const SCOPE_TYPE_PRESETS: Record<string, ScopeTypePreset[]> = {
  create_my_own: [
    {
      label_singular: "My First Grouping",
      label_plural: "My First Groupings",
      icon: "Folder",
      color: "#3b82f6",
      scopes: ["First type of item", "Second type of item"],
    },
    {
      label_singular: "My Second Grouping",
      label_plural: "My Second Groupings",
      icon: "Folder",
      color: "#8b5cf6",
      scopes: ["Third type of item", "Fourth type of item"],
    },
  ],
  universal: [
    {
      label_singular: "Department",
      label_plural: "Departments",
      icon: "Building2",
      color: "#3b82f6",
      scopes: [
        "Engineering",
        "Marketing",
        "Sales",
        "Operations",
        "Finance",
        "HR",
      ],
    },
    {
      label_singular: "Team",
      label_plural: "Teams",
      icon: "Users",
      color: "#8b5cf6",
      scopes: ["Core Team", "Support Team", "Leadership"],
    },
  ],
  web_development_agency: [
    {
      label_singular: "Client",
      label_plural: "Clients",
      icon: "Building",
      color: "#3b82f6",
      scopes: [],
    },
    {
      label_singular: "Tech Stack",
      label_plural: "Tech Stacks",
      icon: "Code2",
      color: "#10b981",
      scopes: ["React", "Next.js", "Vue", "WordPress", "Shopify"],
    },
    {
      label_singular: "Service",
      label_plural: "Services",
      icon: "Briefcase",
      color: "#f59e0b",
      scopes: [
        "Web Design",
        "Web Development",
        "SEO",
        "Maintenance",
        "Consulting",
      ],
    },
  ],
  seo_agency: [
    {
      label_singular: "Client",
      label_plural: "Clients",
      icon: "Building",
      color: "#3b82f6",
      scopes: [],
    },
    {
      label_singular: "Channel",
      label_plural: "Channels",
      icon: "Share2",
      color: "#8b5cf6",
      scopes: [
        "Organic Search",
        "Paid Search",
        "Social Media",
        "Email",
        "Content Marketing",
      ],
    },
    {
      label_singular: "Campaign Type",
      label_plural: "Campaign Types",
      icon: "Target",
      color: "#ef4444",
      scopes: [
        "Link Building",
        "Technical SEO",
        "Local SEO",
        "Content Strategy",
      ],
    },
  ],
  recruitment: [
    {
      label_singular: "Industry",
      label_plural: "Industries",
      icon: "Factory",
      color: "#3b82f6",
      scopes: [
        "Technology",
        "Healthcare",
        "Finance",
        "Manufacturing",
        "Education",
      ],
    },
    {
      label_singular: "Role Level",
      label_plural: "Role Levels",
      icon: "TrendingUp",
      color: "#10b981",
      scopes: ["Entry Level", "Mid Level", "Senior", "Executive", "C-Suite"],
    },
    {
      label_singular: "Region",
      label_plural: "Regions",
      icon: "MapPin",
      color: "#f59e0b",
      scopes: ["North America", "Europe", "Asia Pacific", "Remote"],
    },
  ],
  law_firm: [
    {
      label_singular: "Practice Area",
      label_plural: "Practice Areas",
      icon: "Scale",
      color: "#3b82f6",
      scopes: [
        "Corporate",
        "Litigation",
        "Real Estate",
        "IP",
        "Employment",
        "Tax",
      ],
    },
    {
      label_singular: "Client Type",
      label_plural: "Client Types",
      icon: "Users",
      color: "#8b5cf6",
      max_assignments: 1,
      scopes: ["Individual", "Small Business", "Corporation", "Government"],
    },
  ],
  workers_comp: [
    {
      label_singular: "Case Type",
      label_plural: "Case Types",
      icon: "Shield",
      color: "#3b82f6",
      scopes: ["Workers Comp", "General Liability", "Subrogation"],
    },
    {
      label_singular: "Jurisdiction",
      label_plural: "Jurisdictions",
      icon: "MapPin",
      color: "#f59e0b",
      scopes: [],
    },
    {
      label_singular: "Carrier",
      label_plural: "Carriers",
      icon: "Building",
      color: "#10b981",
      scopes: [],
    },
  ],
  medical: [
    {
      label_singular: "Specialty",
      label_plural: "Specialties",
      icon: "Heart",
      color: "#ef4444",
      scopes: [
        "Primary Care",
        "Pediatrics",
        "Cardiology",
        "Orthopedics",
        "Dermatology",
      ],
    },
    {
      label_singular: "Location",
      label_plural: "Locations",
      icon: "MapPin",
      color: "#3b82f6",
      scopes: [],
    },
    {
      label_singular: "Insurance",
      label_plural: "Insurances",
      icon: "Shield",
      color: "#10b981",
      scopes: [],
    },
  ],
  shopify: [
    {
      label_singular: "Product Category",
      label_plural: "Product Categories",
      icon: "ShoppingBag",
      color: "#10b981",
      scopes: [],
    },
    {
      label_singular: "Sales Channel",
      label_plural: "Sales Channels",
      icon: "Store",
      color: "#3b82f6",
      scopes: ["Online Store", "POS", "Wholesale", "Social Commerce"],
    },
    {
      label_singular: "Market",
      label_plural: "Markets",
      icon: "Globe",
      color: "#8b5cf6",
      scopes: ["Domestic", "International", "B2B", "B2C"],
    },
  ],
  ebay: [
    {
      label_singular: "Category",
      label_plural: "Categories",
      icon: "Grid",
      color: "#3b82f6",
      scopes: [],
    },
    {
      label_singular: "Condition",
      label_plural: "Conditions",
      icon: "Tag",
      color: "#f59e0b",
      max_assignments: 1,
      scopes: [
        "New",
        "Refurbished",
        "Used - Like New",
        "Used - Good",
        "For Parts",
      ],
    },
    {
      label_singular: "Marketplace",
      label_plural: "Marketplaces",
      icon: "Globe",
      color: "#8b5cf6",
      scopes: ["eBay US", "eBay UK", "eBay DE", "eBay AU"],
    },
  ],
  ai_research: [
    {
      label_singular: "Domain",
      label_plural: "Domains",
      icon: "Brain",
      color: "#8b5cf6",
      scopes: [
        "NLP",
        "Computer Vision",
        "Reinforcement Learning",
        "Generative AI",
        "MLOps",
      ],
    },
    {
      label_singular: "Model Type",
      label_plural: "Model Types",
      icon: "Cpu",
      color: "#3b82f6",
      scopes: ["Transformer", "CNN", "RNN", "GAN", "Diffusion"],
    },
    {
      label_singular: "Stage",
      label_plural: "Stages",
      icon: "GitBranch",
      color: "#10b981",
      max_assignments: 1,
      scopes: [
        "Research",
        "Prototyping",
        "Training",
        "Evaluation",
        "Production",
      ],
    },
  ],
};

interface ScopeTypePreset {
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  max_assignments?: number;
  scopes: string[];
}

interface ScopeTemplateStarterProps {
  organizationId: string;
  compact?: boolean;
  onTypesCreated?: () => void;
}

export function ScopeTemplateStarter({
  organizationId,
  compact,
  onTypesCreated,
}: ScopeTemplateStarterProps) {
  const dispatch = useAppDispatch();
  const existingTypes = useAppSelector((state) =>
    selectScopeTypesByOrg(state, organizationId),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [checkedPresets, setCheckedPresets] = useState<Set<number>>(new Set());

  const existingLabels = new Set(
    existingTypes.map((t) => t.label_singular.toLowerCase()),
  );

  const initChecksForIndustry = (industryKey: string) => {
    const presets = SCOPE_TYPE_PRESETS[industryKey];
    if (!presets) return;
    const initial = new Set<number>();
    presets.forEach((p, i) => {
      if (!existingLabels.has(p.label_singular.toLowerCase())) {
        initial.add(i);
      }
    });
    setCheckedPresets(initial);
  };

  const handleSelectIndustry = (key: string) => {
    setSelectedIndustry(key);
    initChecksForIndustry(key);
  };

  const handleApply = async () => {
    if (!selectedIndustry) return;
    const presets = SCOPE_TYPE_PRESETS[selectedIndustry];
    if (!presets) return;

    const toCreate = presets.filter((_, i) => checkedPresets.has(i));
    if (toCreate.length === 0) return;

    setApplying(true);
    try {
      for (const preset of toCreate) {
        const typeResult = await dispatch(
          createScopeType({
            org_id: organizationId,
            label_singular: preset.label_singular,
            label_plural: preset.label_plural,
            icon: preset.icon,
            description: "",
            sort_order: 0,
            max_assignments: preset.max_assignments,
          }),
        ).unwrap();

        const typeId = (typeResult as { id: string }).id;
        if (typeId && preset.scopes.length > 0) {
          for (const scopeName of preset.scopes) {
            await dispatch(
              createScope({
                org_id: organizationId,
                type_id: typeId,
                name: scopeName,
              }),
            );
          }
        }
      }
      onTypesCreated?.();
      setSheetOpen(false);
      setSelectedIndustry(null);
      setCheckedPresets(new Set());
    } finally {
      setApplying(false);
    }
  };

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border p-2.5 text-left hover:bg-muted/50 transition-colors"
        >
          <Stars className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium">Quick Start Templates</p>
            <p className="text-[10px] text-muted-foreground">
              Industry-specific scope presets
            </p>
          </div>
        </button>
        <TemplateSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          selectedIndustry={selectedIndustry}
          onSelectIndustry={handleSelectIndustry}
          onApply={handleApply}
          applying={applying}
          checkedPresets={checkedPresets}
          onTogglePreset={(i) => {
            setCheckedPresets((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            });
          }}
          existingLabels={existingLabels}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          handleSelectIndustry("create_my_own");
          setSheetOpen(true);
        }}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-left transition-all mb-3"
      >
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <PenLine className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Create My Own</p>
          <p className="text-xs text-muted-foreground">
            Start with a blank template — name your own groupings and add items
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
      </button>
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Stars className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-0.5">
                Quick Start from Templates
              </h3>
              <p className="text-xs text-muted-foreground">
                Choose an industry template to auto-create scope types and
                starter values. You can customize everything afterward.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INDUSTRY_CATEGORIES.filter((c) => c.key !== "create_my_own")
              .slice(0, 6)
              .map((cat) => {
                const Icon = INDUSTRY_ICONS[cat.iconName] ?? Globe;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      handleSelectIndustry(cat.key);
                      setSheetOpen(true);
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all border-border hover:border-primary/30 hover:bg-muted/50"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs truncate">
                      {cat.label.replace(/ \(.*\)/, "")}
                    </span>
                  </button>
                );
              })}
          </div>
          {INDUSTRY_CATEGORIES.filter((c) => c.key !== "create_my_own").length >
            6 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs w-full"
              onClick={() => setSheetOpen(true)}
            >
              View all{" "}
              {
                INDUSTRY_CATEGORIES.filter((c) => c.key !== "create_my_own")
                  .length
              }{" "}
              templates
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
      <TemplateSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        selectedIndustry={selectedIndustry}
        onSelectIndustry={handleSelectIndustry}
        onApply={handleApply}
        applying={applying}
        checkedPresets={checkedPresets}
        onTogglePreset={(i) => {
          setCheckedPresets((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
          });
        }}
        existingLabels={existingLabels}
      />
    </>
  );
}

function TemplateSheet({
  open,
  onOpenChange,
  selectedIndustry,
  onSelectIndustry,
  onApply,
  applying,
  checkedPresets,
  onTogglePreset,
  existingLabels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIndustry: string | null;
  onSelectIndustry: (key: string) => void;
  onApply: () => void;
  applying: boolean;
  checkedPresets: Set<number>;
  onTogglePreset: (index: number) => void;
  existingLabels: Set<string>;
}) {
  const presets = selectedIndustry
    ? SCOPE_TYPE_PRESETS[selectedIndustry]
    : null;
  const industry = INDUSTRY_CATEGORIES.find((c) => c.key === selectedIndustry);
  const creatableCount = presets
    ? presets.filter((_, i) => checkedPresets.has(i)).length
    : 0;

  const panelTitle = presets
    ? `${industry?.label ?? selectedIndustry} Template`
    : "Scope Templates";

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) onSelectIndustry("");
      }}
      title={panelTitle}
      expandButtonLabel="Scope templates"
      dismissDisabled={applying}
      position="right"
      defaultSize={38}
    >
      <div>
        {presets && selectedIndustry ? (
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => onSelectIndustry("")}
            >
              &larr; All Templates
            </Button>

            <p className="text-xs text-muted-foreground">
              Select which scope types to create. Types you already have are
              marked and skipped automatically.
            </p>

            <div className="space-y-2">
              {presets.map((preset, i) => {
                const alreadyExists = existingLabels.has(
                  preset.label_singular.toLowerCase(),
                );
                const isChecked = checkedPresets.has(i);
                const Icon = resolveIcon(preset.icon);

                return (
                  <Card
                    key={i}
                    className={cn(
                      "transition-all",
                      alreadyExists && "opacity-50",
                      isChecked && !alreadyExists && "ring-1 ring-primary/20",
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {alreadyExists ? (
                            <CheckCircle2
                              className="h-4 w-4 text-green-500"
                              aria-hidden
                            />
                          ) : (
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => onTogglePreset(i)}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="h-6 w-6 rounded flex items-center justify-center bg-muted"
                              style={{
                                backgroundColor: hexToRgba(preset.color, 0.15),
                              }}
                            >
                              <Icon
                                className="h-3.5 w-3.5"
                                style={{ color: preset.color }}
                              />
                            </div>
                            <h4 className="text-xs font-semibold">
                              {preset.label_plural}
                            </h4>
                            {preset.max_assignments && (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-4"
                              >
                                max {preset.max_assignments}
                              </Badge>
                            )}
                            {alreadyExists && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] h-4 text-green-600 dark:text-green-400"
                              >
                                Already exists
                              </Badge>
                            )}
                          </div>
                          {preset.scopes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {preset.scopes.map((s) => (
                                <Badge
                                  key={s}
                                  variant="outline"
                                  className="text-[10px]"
                                  style={{
                                    borderColor: hexToRgba(preset.color, 0.4),
                                    color: preset.color,
                                  }}
                                >
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground italic">
                              Empty — you add instances after creation
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button
              className="w-full"
              onClick={onApply}
              disabled={applying || creatableCount === 0}
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...
                </>
              ) : creatableCount === 0 ? (
                "All types already exist"
              ) : (
                `Create ${creatableCount} Scope Type${creatableCount !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onSelectIndustry("create_my_own")}
              className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 text-left transition-all hover:bg-primary/10 hover:border-primary/50"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                <PenLine className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-primary">
                  Create My Own
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Start from scratch with placeholder groupings
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
            </button>

            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground px-1">
                or use a template
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {INDUSTRY_CATEGORIES.filter((c) => c.key !== "create_my_own").map(
              (cat) => {
                const Icon = INDUSTRY_ICONS[cat.iconName] ?? Globe;
                const presetCount = SCOPE_TYPE_PRESETS[cat.key]?.length ?? 0;

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => onSelectIndustry(cat.key)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all border-border hover:border-primary/20 hover:bg-muted/40"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{cat.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {presetCount} scope type{presetCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>
    </MatrxDynamicPanelHost>
  );
}
