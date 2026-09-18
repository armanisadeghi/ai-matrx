"use client";

/**
 * Facets — own and inherited, one row per facet the organization has.
 *
 * READ: `seo.map_topic_facets` is the authoritative answer (it carries the
 * inherited flag and the value's resolved ref); the loaded tree's
 * `selectMapTopicFacetsWithInheritance` says WHICH ancestor an inherited value
 * came from, which the function does not. Both are read, each for its part.
 *
 * WRITE: `seo.set_map_topic_facet` with `p_source='human'` (the wrapper adds
 * it). A null value slug CLEARS. An inherited value is cleared on the topic that
 * sets it, never here — `FacetChip` already refuses the X on an inherited chip,
 * and the picker offers "set on this topic", which overrides for this subtree.
 *
 * VALUES: `seo.map_facet_value` rows, drawn as a two-level list when they carry
 * `parent_id` (migration 24: region is state → city). A value picker mounts its
 * read only when opened, so a panel over a 255-value region facet costs nothing
 * until someone reaches for it.
 */

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";

import { topicalMapErrorText } from "../../errors";
import { useMapFacets, useMapFacetValues, useMapTopicFacets, useSetMapTopicFacet } from "../../hooks";
import { selectMapTopic, selectMapTopicFacetsWithInheritance } from "../../redux/selectors";
import type { MapFacet, MapFacetValue } from "../../types";
import { FacetChip } from "../../ui/FacetChip";
import { PanelEmptyLine, PanelSection } from "../PanelSection";

export interface FacetsSectionProps {
  mapId: string;
  slug: string;
  organizationId: string | null;
  brandId: string | null;
  readOnly: boolean;
}

export function FacetsSection({ mapId, slug, organizationId, brandId, readOnly }: FacetsSectionProps) {
  const facets = useMapTopicFacets(mapId, slug);
  const inherited = useAppSelector(selectMapTopicFacetsWithInheritance(mapId, slug));
  const catalogue = useMapFacets(
    { organizationId: organizationId ?? "" },
    organizationId !== null && !readOnly,
  );
  const setFacet = useSetMapTopicFacet(mapId);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function write(facetKey: string, valueSlug: string | null) {
    setRefusal(null);
    try {
      await setFacet.mutateAsync({ slug, facetKey, valueSlug });
      void facets.refetch();
    } catch (error) {
      setRefusal(topicalMapErrorText(error));
    }
  }

  const fromSlugByKey = new Map(inherited.map((entry) => [entry.key, entry]));
  const set = facets.data ?? {};
  const setKeys = Object.keys(set).sort();
  // Facets the organization has but this topic does not carry — offered for setting.
  const unset = (catalogue.data ?? []).filter((facet) => !(facet.key in set));

  return (
    <PanelSection title="Facets" count={facets.data ? setKeys.length : undefined}>
      {facets.isPending ? (
        <SuspenseLoader centered={false} message="Loading this topic's facets…" />
      ) : facets.isError ? (
        <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
          {topicalMapErrorText(facets.error)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {setKeys.length === 0 && unset.length === 0 ? (
            <li>
              <PanelEmptyLine>
                {readOnly
                  ? "No facets on this topic."
                  : "No facets on this topic, and this organization has defined none yet."}
              </PanelEmptyLine>
            </li>
          ) : null}
          {setKeys.map((key) => {
            const value = set[key];
            const from = fromSlugByKey.get(key);
            const facet = catalogue.data?.find((row) => row.key === key) ?? null;
            return (
              <li key={key} className="flex min-w-0 flex-wrap items-center gap-1.5">
                <FacetChip
                  facetKey={key}
                  valueSlug={value.value_slug}
                  inherited={value.inherited}
                  fromSlug={from?.inherited ? from.fromSlug : undefined}
                  onClear={readOnly || value.inherited ? undefined : () => void write(key, null)}
                />
                <InheritedFrom mapId={mapId} entry={value.inherited ? from?.fromSlug ?? null : null} />
                {!readOnly && facet && organizationId ? (
                  <FacetValuePicker
                    facet={facet}
                    organizationId={organizationId}
                    brandId={brandId}
                    current={value.value_slug}
                    label={value.inherited ? "Set on this topic" : "Change"}
                    busy={setFacet.isPending}
                    onPick={(valueSlug) => void write(key, valueSlug)}
                  />
                ) : null}
              </li>
            );
          })}
          {!readOnly && organizationId
            ? unset.map((facet) => (
                <li key={facet.key} className="flex min-w-0 items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{facet.label}</span>
                  <FacetValuePicker
                    facet={facet}
                    organizationId={organizationId}
                    brandId={brandId}
                    current={null}
                    label="Set"
                    icon={Plus}
                    busy={setFacet.isPending}
                    onPick={(valueSlug) => void write(facet.key, valueSlug)}
                  />
                </li>
              ))
            : null}
        </ul>
      )}
      {catalogue.isError ? (
        <p role="alert" className="mt-1 whitespace-pre-wrap text-xs text-destructive">
          {topicalMapErrorText(catalogue.error)}
        </p>
      ) : null}
      {refusal ? (
        <p role="alert" className="mt-1 whitespace-pre-wrap text-xs text-destructive">
          {refusal}
        </p>
      ) : null}
    </PanelSection>
  );
}

/** "from <topic name>" — the ancestor an inherited value came from, named, not slugged. */
function InheritedFrom({ mapId, entry }: { mapId: string; entry: string | null }) {
  const topic = useAppSelector(selectMapTopic(mapId, entry ?? ""));
  if (!entry) return null;
  return (
    <span className="text-[11px] text-muted-foreground">from {topic?.name ?? entry}</span>
  );
}

/**
 * The value picker for ONE facet. Mounts its read only when opened. Values with
 * a parent are drawn under it (state → city) — a flat list of 255 places is
 * exactly the drawing the vision refuses.
 */
function FacetValuePicker({
  facet,
  organizationId,
  brandId,
  current,
  label,
  icon: Icon = ChevronDown,
  busy,
  onPick,
}: {
  facet: MapFacet;
  organizationId: string;
  brandId: string | null;
  current: string | null;
  label: string;
  icon?: typeof ChevronDown;
  busy: boolean;
  onPick: (valueSlug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const values = useMapFacetValues(facet.id, { organizationId, brandId }, open);
  const rows = values.data ?? [];
  const byParent = groupByParent(rows);

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={current ?? undefined}
      onValueChange={(slug) => {
        if (slug !== current) onPick(slug);
      }}
      disabled={busy}
    >
      <SelectTrigger
        className="h-6 w-auto gap-1 border-dashed px-1.5 text-[11px] text-muted-foreground"
        aria-label={`${label} ${facet.label}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {values.isPending && open ? (
          <div className="p-2">
            <SuspenseLoader centered={false} message={`Loading ${facet.label} values…`} />
          </div>
        ) : values.isError ? (
          <p role="alert" className="max-w-64 whitespace-pre-wrap p-2 text-xs text-destructive">
            {topicalMapErrorText(values.error)}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            No values for {facet.label} yet.
          </p>
        ) : (
          byParent.map((group) =>
            group.parent ? (
              <SelectGroup key={group.parent.id}>
                <SelectLabel className="text-[11px]">
                  {group.parent.name}
                </SelectLabel>
                <SelectItem value={group.parent.slug} className="text-xs">
                  {group.parent.name} (all)
                </SelectItem>
                {group.children.map((value) => (
                  <SelectItem key={value.id} value={value.slug} className="pl-6 text-xs">
                    {value.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : (
              group.children.map((value) => (
                <SelectItem key={value.id} value={value.slug} className="text-xs">
                  {value.name}
                </SelectItem>
              ))
            ),
          )
        )}
      </SelectContent>
    </Select>
  );
}

interface ParentGroup {
  parent: MapFacetValue | null;
  children: MapFacetValue[];
}

/** Roots first (each with its children beneath it), then the parentless flat rows. */
export function groupByParent(rows: readonly MapFacetValue[]): ParentGroup[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenOf = new Map<string, MapFacetValue[]>();
  const flat: MapFacetValue[] = [];
  for (const row of rows) {
    if (row.parent_id && byId.has(row.parent_id)) {
      const list = childrenOf.get(row.parent_id) ?? [];
      list.push(row);
      childrenOf.set(row.parent_id, list);
    }
  }
  const groups: ParentGroup[] = [];
  for (const row of rows) {
    if (row.parent_id && byId.has(row.parent_id)) continue;
    const children = childrenOf.get(row.id);
    if (children && children.length > 0) {
      groups.push({ parent: row, children: [...children].sort(byName) });
    } else {
      flat.push(row);
    }
  }
  groups.sort((a, b) => byName(a.parent as MapFacetValue, b.parent as MapFacetValue));
  if (flat.length > 0) groups.push({ parent: null, children: flat.sort(byName) });
  return groups;
}

function byName(a: MapFacetValue, b: MapFacetValue): number {
  return a.name.localeCompare(b.name);
}
