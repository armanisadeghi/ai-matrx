"use client";

/**
 * THE SERVICE PICKER — one control for every gesture that names the service,
 * product, or main thing a keyword relates to: the cell, the bulk panel, and
 * the filter.
 *
 * It is a COMPOSITION over `CreatablePicker` (the platform's one
 * type-ahead-with-Create shape), not a new picker. What it adds is the tree:
 * options are indented parent → child and carry their root, because "Data
 * Destruction Services" means nothing until you can see it sits under a
 * service you sell.
 *
 * P23 — EVERY PICKER TAKES NEW INPUT. Typing a service that does not exist
 * offers `Create "…"`, and the footer's one extra choice says where it goes
 * (its own root, or under an existing topic). Creating and placing is ONE
 * gesture; the write is the topic tree's own `gsc_topic_save`, never a second
 * creation path.
 */

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleSlash } from "lucide-react";

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

/** The filter's and the cell's shared word for "on no service at all". */
export const SERVICE_UNPLACED = "none";

export function ServicePicker({
  siteId,
  services,
  value,
  onSelect,
  placeholder = "Not placed yet",
  unplacedLabel,
  disabled,
  className,
  size = "sm",
  ariaLabel = "Service",
  renderSelected,
}: {
  siteId: string;
  services: SiteServices;
  /** A topic id, `SERVICE_UNPLACED`, or null for "nothing chosen". */
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
}) {
  const queryClient = useQueryClient();
  /** Where a service the person is inventing should hang. "" = its own root. */
  const [newParentId, setNewParentId] = useState("");

  const options: CreatableOption[] = [];
  if (unplacedLabel) {
    options.push({
      value: SERVICE_UNPLACED,
      label: unplacedLabel,
      keywords: "unplaced not placed none no service",
      render: (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CircleSlash className="size-3 shrink-0" />
          {unplacedLabel}
        </span>
      ),
    });
  }
  for (const option of services.options) {
    const meta = rootTypeMeta(option.rootType);
    options.push({
      value: option.topicId,
      label: option.name,
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
          : `Created “${typed}” as a service you sell.`,
      );
      setNewParentId("");
      return topicId;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that service.",
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
      searchPlaceholder="Find or name a service…"
      noun="service"
      onCreate={create}
      disabled={disabled}
      loading={services.loading}
      ariaLabel={ariaLabel}
      emptyLabel="No service by that name yet — type it and add it."
      size={size}
      triggerClassName={className}
      renderSelected={renderSelected}
      createExtra={
        <Select
          value={newParentId || "__root__"}
          onValueChange={(next) =>
            setNewParentId(next === "__root__" ? "" : next)
          }
        >
          <SelectTrigger className="h-7 text-[11px]" aria-label="Where the new service goes">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__root__" className="text-xs">
              Its own root — a service you sell
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
