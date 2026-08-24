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

  /** The screen that governs this vocabulary — the tree, in a new tab. */
  const manageHref = params?.brandId
    ? `/marketing/brands/${params.brandId}/sites/${siteId}/value/topics`
    : null;

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
  // Yours first, the rest of the shared catalog after — tree order preserved
  // inside each heading, and whole roots kept together (see `usedByThisSite`).
  const anyShared = services.options.some((option) => !option.usedByThisSite);
  const ordered = anyShared
    ? [
        ...services.options.filter((option) => option.usedByThisSite),
        ...services.options.filter((option) => !option.usedByThisSite),
      ]
    : services.options;

  for (const option of ordered) {
    const meta = rootTypeMeta(option.rootType);
    options.push({
      value: option.topicId,
      label: option.name,
      group: anyShared
        ? option.usedByThisSite
          ? "Your offerings"
          : "Shared catalog — not used by this site yet"
        : undefined,
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
      manageAction={
        manageHref
          ? { label: "Manage offerings", href: manageHref }
          : undefined
      }
      createExtra={
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
      }
    />
  );
}
