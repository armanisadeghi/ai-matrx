"use client";

/**
 * THE OFFERING PICKER — one control for every gesture that names the offering,
 * product, or main thing a keyword relates to: the cell, the bulk panel, and
 * the filter.
 *
 * It is a COMPOSITION over `CreatablePicker` (the platform's one
 * type-ahead-with-Create shape), not a new picker. What it adds is the tree:
 * options are indented parent → child and carry their root, because "Data
 * Destruction Services" means nothing until you can see it sits under a
 * service you sell.
 *
 * WHERE THE LIST COMES FROM, and why it holds more than one business's
 * offerings: `seo.topic` is ONE catalog shared by every site (no `site_id` —
 * see `listAllTopics`), because cross-site learning needs a shared vocabulary.
 * Arman, 2026-08-24: "the options that it's showing me go beyond the options
 * for this company. So I'm trying to see where this list comes from." The
 * answer is a HEADING, never a filter — the branches this site actually uses
 * come first under "Your offerings", the rest stay reachable underneath, and
 * `manageAction` is the door to the screen that governs them.
 *
 * P23 — EVERY PICKER TAKES NEW INPUT. Typing an offering that does not exist
 * offers `Create "…"`, and the footer's one extra choice says where it goes
 * (its own root, or under an existing topic). Creating and placing is ONE
 * gesture; the write is the topic tree's own `gsc_topic_save`, never a second
 * creation path.
 */

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleSlash, ThumbsDown } from "lucide-react";

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
import { cn } from "@/styles/themes/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { saveTopic } from "@/features/marketing/seo/value-system/topics/data";
import { rootTypeMeta } from "@/features/marketing/seo/value-system/topics/types";
import type { SiteServices } from "../hooks/useSiteServices";

/** The filter's and the cell's shared word for "on no offering at all". */
export const OFFERING_UNPLACED = "none";

export function OfferingPicker({
  siteId,
  services,
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
  services: SiteServices;
  /** A topic id, `OFFERING_UNPLACED`, or null for "nothing chosen". */
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
   * "This isn't something we offer." Arman went looking for that answer in
   * this control and could not find it — because it is not an offering at
   * all, it is the traffic class `Mismatch`, and it lives one column over.
   * Rather than teach the picker a second vocabulary, the caller hands over
   * the door to the ruling it already owns.
   */
  onNotOffered?: () => void;
}) {
  const queryClient = useQueryClient();
  const params = useParams<{ brandId?: string }>();
  /** Where an offering the person is inventing should hang. "" = its own root. */
  const [newParentId, setNewParentId] = useState("");

  /**
   * The screen that governs this vocabulary — the tree, in a new tab.
   *
   * MSR-06: the door used to disappear on any surface whose route carries no
   * brand id (Search Console lives at `/marketing/search-console?site=…`), and
   * a picker that cannot say where its own list comes from is exactly the dead
   * end the platform forbids. The flat site path resolves the brand itself, so
   * a site id is enough everywhere.
   */
  const manageHref = marketingRoutes.site(
    params?.brandId ?? null,
    siteId,
    "/value/topics",
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
  /**
   * THE CATALOG IS NOT A MENU. Arman, 2026-08-25: offerings from the shared
   * `seo.topic` catalog that this business does not offer were listed as
   * directly selectable choices — "that's just crazy and stupid… those should
   * be completely out of the normal drop down." Assigning a keyword to
   * something you do not sell is never a thing to make one click away.
   *
   * So the list a person picks from is THIS SITE'S offerings, full stop. The
   * shared catalog survives where he put it: inside the ADD flow, as
   * suggestions offered the moment someone types a name that is not theirs yet
   * ("you can put your custom one, or here are some you can choose from") —
   * see `createExtra` below.
   */
  const mine = services.options.filter((option) => option.usedByThisSite);
  const shared = services.options.filter((option) => !option.usedByThisSite);

  for (const option of mine) {
    const meta = rootTypeMeta(option.rootType);
    options.push({
      value: option.topicId,
      label: option.name,
      group: undefined,
      keywords: `${option.lineage} ${option.rootName} ${meta.label}`,
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
            <span
              className={cn(
                "shrink-0 text-[10px]",
                meta.offering ? "text-success" : "text-info",
              )}
            >
              {meta.offering ? "sells" : "authority"}
            </span>
          )}
        </span>
      ),
    });
  }

  const create = async (typed: string): Promise<string | null> => {
    try {
      const topicId = await saveTopic(siteId, {
        name: typed,
        // `service` — a thing the business sells — is the honest default for a
        // service someone names here, and it is what every existing child of a
        // service root already carries. Never a coined word: the vocabulary is
        // ROOT_TYPE_META, and retyping a node to authority / recruiting /
        // reputation is one click on the topic tree screen.
        nodeType: "service",
        parentId: newParentId || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
      const under = newParentId
        ? services.byId.get(newParentId)?.name
        : undefined;
      toast.success(
        under
          ? `Created “${typed}” under ${under}.`
          : `Created “${typed}” as an offering you sell.`,
      );
      setNewParentId("");
      return topicId;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that offering.",
      );
      return null;
    }
  };

  /** The shared catalog, offered ONLY while adding — never as a plain choice. */
  const sharedSuggestions = (typed: string) => {
    const needle = typed.trim().toLowerCase();
    if (!needle) return null;
    const matches = shared
      .filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          option.lineage.toLowerCase().includes(needle),
      )
      .slice(0, 5);
    if (matches.length === 0) return null;
    return (
      <div className="rounded-sm border border-border bg-muted/40 p-1.5">
        <p className="px-1 pb-1 text-[11px] text-muted-foreground">
          Already in the shared catalog — adopt one instead of creating a
          duplicate:
        </p>
        {matches.map((option) => (
          <button
            key={option.topicId}
            type="button"
            onClick={() => onSelect(option.topicId)}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
          >
            <span className="min-w-0 truncate text-foreground">{option.name}</span>
            <span className="min-w-0 shrink truncate text-[10px] text-muted-foreground">
              {option.rootName}
            </span>
          </button>
        ))}
      </div>
    );
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
      loading={services.loading}
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
          {sharedSuggestions(typed)}
          <Select
            value={newParentId || "__root__"}
            onValueChange={(next) =>
              setNewParentId(next === "__root__" ? "" : next)
            }
          >
            <SelectTrigger className="h-7 text-[11px]" aria-label="Where the new offering goes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__" className="text-xs">
                Its own root — an offering you sell
              </SelectItem>
              {services.roots.map((root) => (
                <SelectItem key={root.topicId} value={root.topicId} className="text-xs">
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
