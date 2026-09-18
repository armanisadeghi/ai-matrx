"use client";

/**
 * THE OFFERING PICKER — one control for every gesture that names the offering a
 * keyword relates to: the cell, the bulk panel, the filter, the ruling session
 * and the approval queue.
 *
 * It is a COMPOSITION over `CreatablePicker` (the platform's one
 * type-ahead-with-Create shape), not a new picker. What it adds is the tree:
 * options are indented parent → child and carry their root, because "Data
 * Destruction Services" means nothing until you can see it sits under a
 * service you sell.
 *
 * WHERE THE LIST COMES FROM: this site's own offerings, full stop
 * (`web.site_offerings` — the brand's offerings this site has selected, D2).
 * Arman, 2026-08-25, of the old shared catalog listed as choices: "that's just
 * crazy and stupid… those should be completely out of the normal drop down."
 * Platform suggestions survive only where he put them — inside the ADD flow,
 * the moment someone types a name that is not theirs yet (D6), and adopting one
 * copies it into the brand and selects it for this site in one write.
 *
 * P23 — EVERY PICKER TAKES NEW INPUT. Typing an offering that does not exist
 * offers `Create "…"`; the footer says where it goes. Creating and placing is
 * ONE gesture; the write is `web.save_site_offering`, the one creation path.
 */

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleSlash, Plus, ThumbsDown } from "lucide-react";

import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  adoptOfferingTemplate,
  saveSiteOffering,
  searchOfferingTemplates,
} from "@/features/marketing/seo/value-system/offerings/data";
import {
  requireOfferingOrganization,
  SITE_OFFERINGS_KEY,
  type SiteOfferings,
} from "../hooks/useSiteOfferings";

/** The filter's and the cell's shared word for "on no offering at all". */
export const OFFERING_UNPLACED = "none";

/**
 * Platform suggestions for the name being typed — asked for only here, inside
 * Add offering, never listed as a choice.
 */
function TemplateSuggestions({
  siteId,
  typed,
  onAdopt,
}: {
  siteId: string;
  typed: string;
  onAdopt: (templateId: string, name: string) => void;
}) {
  const needle = typed.trim();
  const suggestions = useQuery({
    queryKey: [...SITE_OFFERINGS_KEY, "templates", siteId, needle.toLowerCase()],
    queryFn: ({ signal }) => searchOfferingTemplates(siteId, needle, signal),
    enabled: needle.length >= 2,
    staleTime: 60_000,
  });
  const matches = (suggestions.data ?? []).slice(0, 5);
  if (needle.length < 2 || matches.length === 0) return null;
  return (
    <div className="rounded-sm border border-border bg-muted/40 p-1.5">
      <p className="px-1 pb-1 text-[11px] text-muted-foreground">
        Suggestions — add one instead of creating a duplicate:
      </p>
      {matches.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onAdopt(template.id, template.name)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
        >
          <Plus className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-foreground">{template.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {template.adopted ? "your brand already has it" : template.kind}
          </span>
        </button>
      ))}
    </div>
  );
}

export function OfferingPicker({
  siteId,
  offerings,
  value,
  onSelect,
  placeholder = "Not placed yet",
  unplacedLabel,
  disabled,
  className,
  size = "sm",
  ariaLabel = "Offering",
  renderSelected,
  onNotOffered,
}: {
  siteId: string;
  offerings: SiteOfferings;
  /** A brand offering id, `OFFERING_UNPLACED`, or null for "nothing chosen". */
  value: string | null;
  onSelect: (next: string) => void;
  placeholder?: string;
  /** Offer the "not placed" choice — as a filter, or to take a keyword off. */
  unplacedLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
  /** What the trigger shows once something is chosen (a cell wants one line). */
  renderSelected?: ReactNode;
  /**
   * "This isn't something we offer." It is not an offering at all — it is the
   * traffic class `Mismatch` — so the caller hands over the door to the ruling
   * it already owns.
   */
  onNotOffered?: () => void;
}) {
  const queryClient = useQueryClient();
  const params = useParams<{ brandId?: string }>();
  /** Where an offering the person is inventing should hang. "" = its own root. */
  const [newParentId, setNewParentId] = useState("");

  /** The screen that governs this site's offerings. */
  const manageHref = marketingRoutes.site(
    params?.brandId ?? null,
    siteId,
    "/value/offerings",
  );

  const options: CreatableOption[] = [];
  if (unplacedLabel) {
    options.push({
      value: OFFERING_UNPLACED,
      label: unplacedLabel,
      keywords: "unplaced not placed none no offering",
      render: (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CircleSlash className="size-3 shrink-0" />
          {unplacedLabel}
        </span>
      ),
    });
  }
  for (const option of offerings.options) {
    options.push({
      value: option.offeringId,
      label: option.name,
      keywords: `${option.lineage} ${option.rootName} ${option.kind}`,
      hint: option.keywords > 0 ? `${option.keywords} kw` : undefined,
      render: (
        <span
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: `${Math.min(option.depth, 6) * 10}px` }}
        >
          <span className="min-w-0 truncate text-foreground">{option.name}</span>
          {option.depth > 0 ? (
            <span className="min-w-0 shrink truncate text-[10px] text-muted-foreground">
              {option.rootName}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-success">{option.kind}</span>
          )}
        </span>
      ),
    });
  }

  const settle = () => queryClient.invalidateQueries({ queryKey: SITE_OFFERINGS_KEY });

  const create = async (typed: string): Promise<string | null> => {
    try {
      const offeringId = await saveSiteOffering({
        organizationId: requireOfferingOrganization(offerings),
        siteId,
        name: typed,
        // A thing the business sells, named here, is a service unless the
        // Offerings screen says otherwise; retyping to a product is one edit there.
        kind: "service",
        parentId: newParentId || null,
      });
      await settle();
      const under = newParentId ? offerings.byId.get(newParentId)?.name : undefined;
      toast.success(
        under ? `Created “${typed}” under ${under}.` : `Created “${typed}” as an offering you sell.`,
      );
      setNewParentId("");
      return offeringId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that offering.");
      return null;
    }
  };

  const adopt = async (templateId: string, name: string) => {
    try {
      const offeringId = await adoptOfferingTemplate({
        organizationId: requireOfferingOrganization(offerings),
        siteId,
        templateId,
      });
      await settle();
      toast.success(`Added “${name}” to this site's offerings.`);
      onSelect(offeringId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that offering.");
    }
  };

  return (
    <CreatablePicker
      value={value}
      options={options}
      onSelect={onSelect}
      placeholder={placeholder}
      searchPlaceholder="Find or name an offering…"
      noun="offering"
      onCreate={create}
      disabled={disabled}
      loading={offerings.loading}
      ariaLabel={ariaLabel}
      emptyLabel="No offering by that name yet — type it and add it."
      size={size}
      triggerClassName={className}
      renderSelected={renderSelected}
      footerActions={
        onNotOffered
          ? [
              {
                label: "This isn’t something we offer",
                icon: ThumbsDown,
                onSelect: onNotOffered,
                note: "Files it under the Mismatch class — traffic you don’t want.",
              },
            ]
          : undefined
      }
      manageAction={{ label: "Manage offerings", href: manageHref }}
      createExtra={(typed) => (
        <div className="flex flex-col gap-1.5">
          <TemplateSuggestions siteId={siteId} typed={typed} onAdopt={adopt} />
          <Select
            value={newParentId || "__root__"}
            onValueChange={(next) => setNewParentId(next === "__root__" ? "" : next)}
          >
            <SelectTrigger className="h-7 text-[11px]" aria-label="Where the new offering goes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__" className="text-xs">
                Its own root — an offering you sell
              </SelectItem>
              {offerings.roots.map((root) => (
                <SelectItem key={root.offeringId} value={root.offeringId} className="text-xs">
                  Under {root.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}
