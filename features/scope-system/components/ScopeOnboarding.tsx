"use client";

// features/scope-system/components/ScopeOnboarding.tsx
//
// The single first-run surface an org sees before it has any scope types.
// Replaces two divergent empty states (ScopesManager + ScopeManagerPage) so
// there is one place that teaches the concept and offers the starting paths.
//
// Three things happen here:
//   1. Lead-with framing — we never open with the word "scope". We ask what
//      the org works around and show it, because "scope" means nothing cold.
//   2. A ghost preview board — a few common dimensions rendered as real-looking
//      mini tables (rows = scopes, columns = context items, cells = values).
//      It is purely illustrative: clearly marked "Preview" and nothing is
//      persisted until the user acts. "Add this" creates the type + its
//      columns only — no sample rows are seeded (we don't want garbage data).
//   3. The three explicit starting paths: build your own, an industry
//      template, or a single individual scope.
//
// Writes go through the same Redux thunks the template drawer uses, so there
// is no parallel mutation path.

import React, { useState } from "react";
import {
  Building2,
  Users,
  MapPin,
  Baby,
  PawPrint,
  Target,
  Plus,
  LayoutTemplate,
  Boxes,
  Check,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  createScopeType,
  fetchScopeTypes,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchScopes } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  createContextItem,
  listScopeTypeItems,
} from "@/features/scope-system/redux/contextItemsSlice";
import { slugifyKey } from "@/features/scope-system/utils/slugify";
import { AddScopeModal } from "@/features/scope-system/components/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scope-system/components/TemplateGalleryDrawer";

// A column shown in the ghost preview. `name` becomes a context item if the
// dimension is added; sample values are illustrative only.
interface PreviewColumn {
  name: string;
  samples: [string, string];
}

interface PreviewDimension {
  key: string;
  icon: LucideIcon;
  // tailwind text color class for the glyph
  tone: string;
  singular: string;
  plural: string;
  rows: [string, string];
  columns: PreviewColumn[];
}

const PRO_DIMENSIONS: PreviewDimension[] = [
  {
    key: "clients",
    icon: Building2,
    tone: "text-sky-600 dark:text-sky-400",
    singular: "Client",
    plural: "Clients",
    rows: ["Acme Co.", "Globex"],
    columns: [
      { name: "Industry", samples: ["Manufacturing", "Retail"] },
      { name: "Primary contact", samples: ["Jane Doe", "Sam Lee"] },
      { name: "Status", samples: ["Active", "Prospect"] },
    ],
  },
  {
    key: "departments",
    icon: Users,
    tone: "text-violet-600 dark:text-violet-400",
    singular: "Department",
    plural: "Departments",
    rows: ["Engineering", "Sales"],
    columns: [
      { name: "Lead", samples: ["Priya N.", "Marco R."] },
      { name: "Headcount", samples: ["12", "8"] },
    ],
  },
  {
    key: "locations",
    icon: MapPin,
    tone: "text-amber-600 dark:text-amber-400",
    singular: "Location",
    plural: "Locations",
    rows: ["HQ", "West Coast"],
    columns: [
      { name: "Region", samples: ["Central", "West"] },
      { name: "Type", samples: ["Office", "Remote"] },
    ],
  },
];

const PERSONAL_DIMENSIONS: PreviewDimension[] = [
  {
    key: "kids",
    icon: Baby,
    tone: "text-sky-600 dark:text-sky-400",
    singular: "Kid",
    plural: "Kids",
    rows: ["Ava", "Sara"],
    columns: [
      { name: "Age", samples: ["15", "12"] },
      { name: "Grade", samples: ["10", "7"] },
      { name: "School", samples: ["Lincoln High", "Oak Middle"] },
    ],
  },
  {
    key: "pets",
    icon: PawPrint,
    tone: "text-amber-600 dark:text-amber-400",
    singular: "Pet",
    plural: "Pets",
    rows: ["Rex", "Luna"],
    columns: [
      { name: "Species", samples: ["Dog", "Cat"] },
      { name: "Vet", samples: ["Dr. Smith", "Dr. Patel"] },
    ],
  },
  {
    key: "goals",
    icon: Target,
    tone: "text-violet-600 dark:text-violet-400",
    singular: "Goal",
    plural: "Goals",
    rows: ["Run a 5K", "Read 12 books"],
    columns: [
      { name: "Target date", samples: ["Jun 2026", "Dec 2026"] },
      { name: "Status", samples: ["In progress", "Not started"] },
    ],
  },
];

interface ScopeOnboardingProps {
  orgId: string;
  /** Personal orgs get a personal-flavored ghost board + personal templates. */
  isPersonal?: boolean;
  /** Fired after anything is created so the host can refetch. */
  onChanged?: () => void;
}

export function ScopeOnboarding({
  orgId,
  isPersonal,
  onChanged,
}: ScopeOnboardingProps) {
  const dispatch = useAppDispatch();
  const [addOpen, setAddOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<
    "templates" | "individual" | null
  >(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const dimensions = isPersonal ? PERSONAL_DIMENSIONS : PRO_DIMENSIONS;

  async function addDimension(dim: PreviewDimension) {
    setCreatingKey(dim.key);
    try {
      const type = await dispatch(
        createScopeType({
          org_id: orgId,
          label_singular: dim.singular,
          label_plural: dim.plural,
          icon: iconNameFor(dim.key),
        }),
      ).unwrap();
      // Columns become context items. Sample rows are NOT seeded.
      for (const col of dim.columns) {
        await dispatch(
          createContextItem({
            scope_type_id: type.id,
            key: slugifyKey(col.name) || col.name.toLowerCase(),
            display_name: col.name,
          }),
        ).unwrap();
      }
      dispatch(listScopeTypeItems(type.id));
      dispatch(fetchScopeTypes(orgId));
      dispatch(fetchScopes({ org_id: orgId }));
      toast.success(`Added "${dim.plural}"`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that");
    } finally {
      setCreatingKey(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Lead-with framing — concrete before jargon */}
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-foreground">
          What does {isPersonal ? "your life" : "your organization"} revolve
          around?
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {isPersonal
            ? "Most people organize things around their kids, their pets, their goals. Pick the ones that fit and your assistant will keep track of the details for each."
            : "Most teams organize everything around a few things — their clients, their departments, their locations. Set up the ones that fit and your assistant will keep the details for each in one place."}
        </p>
        <p className="text-xs text-muted-foreground/80 mt-1.5">
          These are called <span className="font-medium">scopes</span>. Here's
          what a couple look like filled in.
        </p>
      </div>

      {/* Ghost preview board */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {dimensions.map((dim) => (
            <GhostDimensionCard
              key={dim.key}
              dim={dim}
              busy={creatingKey === dim.key}
              disabled={creatingKey !== null}
              onAdd={() => addDimension(dim)}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70 text-center">
          Preview — these are examples. Nothing is saved until you add it.
        </p>
      </div>

      {/* The three explicit starting paths */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Or start another way
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PathCard
            icon={Plus}
            title="Create my own"
            description="Define a dimension from scratch with exactly the details you track."
            onClick={() => setAddOpen(true)}
          />
          <PathCard
            icon={LayoutTemplate}
            title="Use an industry template"
            description="Pick a ready-made set for your line of work — fully editable after."
            onClick={() => setDrawerMode("templates")}
          />
          <PathCard
            icon={Boxes}
            title="Start with one scope"
            description="Add a single common scope, like Clients, and learn the idea as you go."
            onClick={() => setDrawerMode("individual")}
          />
        </div>
      </div>

      <AddScopeModal open={addOpen} onOpenChange={setAddOpen} orgId={orgId} />
      <TemplateGalleryDrawer
        open={drawerMode !== null}
        onOpenChange={(o) => !o && setDrawerMode(null)}
        orgId={orgId}
        personalOnly={isPersonal ? true : undefined}
        initialMode={drawerMode ?? "templates"}
        onApplied={onChanged}
      />
    </div>
  );
}

// AddScopeModal / createScopeType take a string icon name. Map our preview
// glyphs to the matching name the rest of the system resolves.
function iconNameFor(key: string): string {
  switch (key) {
    case "clients":
      return "Building2";
    case "departments":
      return "Users";
    case "locations":
      return "MapPin";
    case "kids":
      return "Baby";
    case "pets":
      return "PawPrint";
    case "goals":
      return "Target";
    default:
      return "Folder";
  }
}

function GhostDimensionCard({
  dim,
  busy,
  disabled,
  onAdd,
}: {
  dim: PreviewDimension;
  busy: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const Icon = dim.icon;
  return (
    <Card className="p-4 flex flex-col gap-3 bg-card/60">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-5 w-5 shrink-0 ${dim.tone}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {dim.plural}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            one {dim.singular.toLowerCase()} per row
          </p>
        </div>
      </div>

      {/* Mini table: rows = scopes, columns = context items, cells = values */}
      <div className="rounded-md border border-border/70 overflow-hidden text-[11px]">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="text-left font-medium px-2 py-1 w-[34%]">
                {dim.singular}
              </th>
              {dim.columns.map((c) => (
                <th
                  key={c.name}
                  className="text-left font-medium px-2 py-1 truncate"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dim.rows.map((row, rIdx) => (
              <tr key={row} className="border-t border-border/60">
                <td className="px-2 py-1 font-medium text-foreground truncate">
                  {row}
                </td>
                {dim.columns.map((c) => (
                  <td
                    key={c.name}
                    className="px-2 py-1 text-muted-foreground truncate"
                  >
                    {c.samples[rIdx]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span className="text-[10px] text-muted-foreground/70">
          {dim.columns.length} detail
          {dim.columns.length === 1 ? "" : "s"} tracked
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          disabled={disabled}
          className="h-7"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Check className="h-3.5 w-3.5 mr-1" />
              Add {dim.plural}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function PathCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
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
      className="p-4 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-all flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        {description}
      </p>
    </Card>
  );
}

export default ScopeOnboarding;
