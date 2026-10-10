"use client";

// features/scopes/components/management/ScopeOnboarding.tsx
//
// Canonical first-run surface an org sees before it has any scope types
// (Lane F W8 rebuild of the legacy features/scope-system ScopeOnboarding).
// Same three moves: lead-with framing, a ghost preview board, and the three
// explicit starting paths — but every write goes through the sanctioned
// RPC-backed thunks (createScopeType + createContextItem), which fold the
// created rows straight into the canonical tree.

import { useState } from "react";
import {
  Building2,
  Users,
  MapPin,
  Plus,
  LayoutTemplate,
  Check,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createScopeType } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { createContextItem } from "@/features/scopes/redux/thunks/contextItemMutations";
import { toFieldKey } from "@ai-matrx/records/scopes";
import { AddScopeModal } from "@/features/scopes/components/management/AddScopeModal";
import { useRouter } from "next/navigation";
import { TEMPLATE_GALLERY_HREF } from "@/features/make/gallery/galleryHref";
import { isScopesRpcErr } from "@/features/scopes/types";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_CELL,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";

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
      { name: "Contact", samples: ["Jane Doe", "Sam Lee"] },
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
      { name: "Budget", samples: ["$1.4M", "$900K"] },
    ],
  },
  {
    key: "locations",
    icon: MapPin,
    tone: "text-amber-600 dark:text-amber-400",
    singular: "Location",
    plural: "Locations",
    rows: ["HQ — Austin", "West Coast"],
    columns: [
      { name: "Region", samples: ["Central", "West"] },
      { name: "Type", samples: ["Office", "Remote"] },
      { name: "Headcount", samples: ["140", "35"] },
    ],
  },
];

interface ScopeOnboardingProps {
  orgId: string;
  /** Fired after anything is created so the host can react. */
  onChanged?: () => void;
}

export function ScopeOnboarding({
  orgId,
  onChanged,
}: ScopeOnboardingProps) {
  const dispatch = useAppDispatch();
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const dimensions = PRO_DIMENSIONS;

  async function addDimension(dim: PreviewDimension) {
    setCreatingKey(dim.key);
    try {
      const typeRes = await dispatch(
        createScopeType({
          org_id: orgId,
          label_singular: dim.singular,
          label_plural: dim.plural,
          icon: iconNameFor(dim.key),
        }),
      );
      if (isScopesRpcErr(typeRes)) throw new Error(typeRes.error.message);
      // Columns become context items. Sample rows are NOT seeded.
      for (const col of dim.columns) {
        const itemRes = await dispatch(
          createContextItem({
            scope_type_id: typeRes.data.id,
            key: toFieldKey(col.name) || col.name.toLowerCase(),
            display_name: col.name,
          }),
        );
        if (isScopesRpcErr(itemRes)) throw new Error(itemRes.error.message);
      }
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
          What does your organization revolve around?
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {"Most teams organize everything around a few things — their clients, their departments, their locations. Set up the ones that fit and your assistant will keep the details for each in one place."}
        </p>
        <p className="text-xs text-muted-foreground/80 mt-1.5">
          These are called <span className="font-medium">scopes</span>.
          Here&apos;s what a couple look like filled in.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            onClick={() => router.push(TEMPLATE_GALLERY_HREF)}
          />
        </div>
      </div>

      <AddScopeModal open={addOpen} onOpenChange={setAddOpen} orgId={orgId} />
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
        <table className={cn("sm:table-fixed", MOBILE_TABLE)}>
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th
                className={cn(
                  "text-left font-medium px-2 py-1 sm:w-[34%]",
                  MOBILE_TABLE_FROZEN_HEAD,
                  "max-sm:min-w-[120px] max-sm:bg-muted",
                )}
              >
                {dim.singular}
              </th>
              {dim.columns.map((c) => (
                <th
                  key={c.name}
                  className={cn(
                    "text-left font-medium px-2 py-1 sm:truncate",
                    MOBILE_TABLE_CELL,
                  )}
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dim.rows.map((row, rIdx) => (
              <tr key={row} className="border-t border-border/60">
                <td
                  className={cn(
                    "px-2 py-1 font-medium text-foreground sm:truncate",
                    MOBILE_TABLE_FROZEN_CELL,
                    "max-sm:min-w-[120px]",
                  )}
                >
                  {row}
                </td>
                {dim.columns.map((c) => (
                  <td
                    key={c.name}
                    className={cn(
                      "px-2 py-1 text-muted-foreground sm:truncate",
                      MOBILE_TABLE_CELL,
                    )}
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
          variant="outline"
          onClick={onAdd}
          disabled={disabled}
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
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </Card>
  );
}
