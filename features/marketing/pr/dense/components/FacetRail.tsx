"use client";

/**
 * The facet rail — level 0 of the console.
 *
 * Every vocabulary here comes from the table's CHECK constraint, not from what
 * happens to be loaded, so a value with zero rows renders disabled at zero
 * rather than vanishing. A facet list that silently shrinks teaches the
 * operator that the pipeline only ever contains what they can currently see,
 * which is the opposite of what a facet rail is for.
 *
 * Counts are computed by the same `select.ts` functions the list uses, so the
 * rail and the list cannot disagree.
 */

import { Filter, Globe, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  ACTION_LABEL,
  ANGLE_STATUSES,
  ANGLE_TYPE_LABEL,
  ANGLE_TYPES,
  buildEvidenceLedger,
  ENDOWMENT_LABEL,
  ENDOWMENTS,
  PLATFORM_LABEL,
  RECOMMENDED_ACTIONS,
  REQUEST_PLATFORMS,
  REQUEST_STATUSES,
  titleCase,
  type CoverageMentionRow,
  type SourceRequestRow,
  type StoryAngleRow,
} from "../types";
import {
  activeFilterCount,
  countBy,
  unattributedCoverage,
  type PressFilters,
} from "../select";
import { MEDIA_LISTS_HREF, type PressTab } from "../routes";
import { FacetButton, RailSection } from "./chrome";

const ACTION_TONE_MAP: Record<string, "good" | "accent" | "cool" | "warn" | "muted"> =
  {
    pitch_now: "good",
    develop_evidence: "accent",
    hold_for_timing: "cool",
    needs_expert_input: "warn",
    park: "muted",
  };

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

export function FacetRail({
  tab,
  filters,
  onChange,
  onReset,
  angles,
  requests,
  coverage,
  siteId,
  siteName,
  brandName,
}: {
  tab: PressTab;
  filters: PressFilters;
  onChange: (next: PressFilters) => void;
  onReset: () => void;
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  siteId: string | null;
  siteName: string;
  brandName: string;
}) {
  const actionCounts = countBy(angles, (row) => row.recommended_action);
  const statusCounts = countBy(angles, (row) => row.status);
  const endowmentCounts = countBy(angles, (row) => row.endowment);
  const typeCounts = countBy(angles, (row) => row.angle_type);
  const requestStatusCounts = countBy(requests, (row) => row.status);
  const platformCounts = countBy(requests, (row) => row.platform);

  const ledgers = angles.map(buildEvidenceLedger);
  const needsProof = ledgers.filter((ledger) => !ledger.provable).length;
  const ready = ledgers.filter((ledger) => ledger.provable).length;
  const active = activeFilterCount(filters);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 border-b border-border px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
          {siteId ? (
            <EntityRef
              token="web_site"
              id={siteId}
              name={siteName}
              openInNewTab
              className="min-w-0 text-xs"
            />
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              No site selected
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {brandName}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </span>
        {active > 0 ? (
          <>
            <span className="text-[11px] tabular-nums text-primary">{active}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 gap-1 px-1 text-[11px] text-muted-foreground"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </Button>
          </>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">none</span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {tab === "requests" ? (
          <>
            <RailSection title="Query status">
              {REQUEST_STATUSES.map((status) => (
                <FacetButton
                  key={status}
                  label={titleCase(status)}
                  count={requestStatusCounts.get(status) ?? 0}
                  active={filters.requestStatuses.includes(status)}
                  disabled={(requestStatusCounts.get(status) ?? 0) === 0}
                  tone={
                    status === "won"
                      ? "good"
                      : status === "expired"
                        ? "muted"
                        : "cool"
                  }
                  onClick={() =>
                    onChange({
                      ...filters,
                      requestStatuses: toggle(filters.requestStatuses, status),
                    })
                  }
                />
              ))}
            </RailSection>
            <RailSection title="Platform">
              {REQUEST_PLATFORMS.map((platform) => (
                <FacetButton
                  key={platform}
                  label={PLATFORM_LABEL[platform] ?? platform}
                  count={platformCounts.get(platform) ?? 0}
                  active={filters.platforms.includes(platform)}
                  disabled={(platformCounts.get(platform) ?? 0) === 0}
                  onClick={() =>
                    onChange({
                      ...filters,
                      platforms: toggle(filters.platforms, platform),
                    })
                  }
                />
              ))}
            </RailSection>
          </>
        ) : tab === "coverage" ? (
          <RailSection title="Coverage">
            <div className="space-y-1 px-1.5 py-1 text-[11px] text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {coverage.filter((row) => !row.is_competitor).length}
                </span>{" "}
                pieces about you,{" "}
                <span className="font-medium text-foreground">
                  {coverage.filter((row) => row.is_competitor).length}
                </span>{" "}
                about competitors.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {coverage.filter((row) => row.links_to_site).length}
                </span>{" "}
                link back to your site.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {unattributedCoverage(coverage, angles).length}
                </span>{" "}
                could not be tied to an angle — `coverage_mention` has no foreign
                key to `story_angle`, so attribution is read from
                `metadata.story_angle_id`.
              </p>
              <a
                href={MEDIA_LISTS_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block pt-1 text-primary hover:underline"
              >
                Open media lists in the CRM
              </a>
            </div>
          </RailSection>
        ) : (
          <>
            <RailSection title="Do next">
              {RECOMMENDED_ACTIONS.map((action) => (
                <FacetButton
                  key={action}
                  label={ACTION_LABEL[action] ?? titleCase(action)}
                  count={actionCounts.get(action) ?? 0}
                  active={filters.actions.includes(action)}
                  disabled={(actionCounts.get(action) ?? 0) === 0}
                  tone={ACTION_TONE_MAP[action]}
                  onClick={() =>
                    onChange({ ...filters, actions: toggle(filters.actions, action) })
                  }
                />
              ))}
            </RailSection>

            <RailSection title="Proof">
              <FacetButton
                label="Ready to pitch today"
                count={ready}
                active={filters.onlyProvable}
                tone="good"
                onClick={() =>
                  onChange({
                    ...filters,
                    onlyProvable: !filters.onlyProvable,
                    onlyGaps: false,
                  })
                }
              />
              <FacetButton
                label="Still gathering proof"
                count={needsProof}
                active={filters.onlyGaps}
                tone="accent"
                onClick={() =>
                  onChange({
                    ...filters,
                    onlyGaps: !filters.onlyGaps,
                    onlyProvable: false,
                  })
                }
              />
            </RailSection>

            <RailSection title="Stage">
              {ANGLE_STATUSES.map((status) => (
                <FacetButton
                  key={status}
                  label={titleCase(status)}
                  count={statusCounts.get(status) ?? 0}
                  active={filters.angleStatuses.includes(status)}
                  disabled={(statusCounts.get(status) ?? 0) === 0}
                  tone={
                    status === "landed"
                      ? "good"
                      : status === "dismissed"
                        ? "muted"
                        : "cool"
                  }
                  onClick={() =>
                    onChange({
                      ...filters,
                      angleStatuses: toggle(filters.angleStatuses, status),
                    })
                  }
                />
              ))}
            </RailSection>

            <RailSection title="What makes it yours">
              {ENDOWMENTS.map((endowment) => (
                <FacetButton
                  key={endowment}
                  label={ENDOWMENT_LABEL[endowment] ?? endowment}
                  count={endowmentCounts.get(endowment) ?? 0}
                  active={filters.endowments.includes(endowment)}
                  disabled={(endowmentCounts.get(endowment) ?? 0) === 0}
                  onClick={() =>
                    onChange({
                      ...filters,
                      endowments: toggle(filters.endowments, endowment),
                    })
                  }
                />
              ))}
            </RailSection>

            <RailSection title="Story type">
              {ANGLE_TYPES.map((angleType) => (
                <FacetButton
                  key={angleType}
                  label={ANGLE_TYPE_LABEL[angleType] ?? angleType}
                  count={typeCounts.get(angleType) ?? 0}
                  active={filters.angleTypes.includes(angleType)}
                  disabled={(typeCounts.get(angleType) ?? 0) === 0}
                  onClick={() =>
                    onChange({
                      ...filters,
                      angleTypes: toggle(filters.angleTypes, angleType),
                    })
                  }
                />
              ))}
            </RailSection>
          </>
        )}
      </ScrollArea>
    </div>
  );
}
