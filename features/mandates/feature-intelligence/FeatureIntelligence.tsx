"use client";

// features/mandates/feature-intelligence/FeatureIntelligence.tsx
//
// THE FEATURE INTELLIGENCE PAGE BODY — one component for every feature and
// every level (UI-REGISTER "Feature intelligence pages", "One UI for all
// levels"). Given a feature, it lists that feature's jobs for the viewer:
// what runs each one for them now and who chose it, what it can use, what it
// makes, where in the feature it runs — and on every row, Duplicate & modify
// or Use my own, plus Reset when the viewer's level decided. An organization
// admin switches the seat to manage it for everyone in the organization.

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
  selectOrganizationName,
  selectPersonalOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { useUserRole } from "@/features/organizations/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { memberMandateRecordHref } from "../member-list/routes";
import { useFeatureIntelligence } from "./useFeatureIntelligence";
import { rungFor, useIntelligenceActions } from "./useIntelligenceActions";
import { IntelligenceJobCard, type RunOverride } from "./IntelligenceJobCard";
import { PlacesMap } from "./PlacesMap";
import { UseOwnDialog } from "./UseOwnDialog";
import { declaredPlacesFor } from "./places";
import { effectiveRunOverride } from "./run-override";
import type {
  FeatureIntelligenceRow,
  IntelligenceContext,
  IntelligenceLevel,
} from "./types";

export interface FeatureIntelligenceProps {
  /** Mandate-key prefix of the feature (`flashcards`, `research`). */
  feature: string;
  /** Values the feature's place links need (`topicId`, `setId`, …). */
  context?: IntelligenceContext;
  /** Open with this job in view and highlighted. */
  focusMandateKey?: string | null;
  /**
   * A choice made for THIS context that runs ahead of the ladder (a research
   * topic's own agent). Keyed by mandate key.
   */
  runOverrides?: Readonly<Record<string, RunOverride>>;
  /** Remove an older context-specific choice after a mandate choice is saved. */
  clearRunOverride?: (mandateKey: string) => Promise<void>;
  /** False when the route's header already names the page. */
  showTitle?: boolean;
  className?: string;
}

function titleCase(feature: string): string {
  return feature
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function FeatureIntelligence({
  feature,
  context = {},
  focusMandateKey = null,
  runOverrides = {},
  clearRunOverride,
  showTitle = true,
  className,
}: FeatureIntelligenceProps) {
  const activeOrgId = useAppSelector(selectOrganizationId);
  const orgBootstrapResolved = useAppSelector(selectOrgBootstrapResolved);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const personalOrgId = useAppSelector(selectPersonalOrganizationId);
  const userId = useAppSelector(selectUserId);
  const { isAdmin, loading: roleLoading } = useUserRole(activeOrgId ?? undefined);
  const canManageOrg =
    Boolean(activeOrgId) && activeOrgId !== personalOrgId && isAdmin;

  const [level, setLevel] = useState<IntelligenceLevel>("person");
  const seatLevel: IntelligenceLevel = canManageOrg ? level : "person";
  const orgLevel = seatLevel === "organization";

  const state = useFeatureIntelligence({
    feature,
    level: seatLevel,
    organizationId: activeOrgId,
    userId,
    context,
    // Read once, for the settled seat: not before the organization bootstrap
    // has answered (a read with no org is thrown away the moment it arrives),
    // and the role only matters on the organization level — waiting on it at
    // the person level refetched every job the moment it flickered.
    enabled:
      (orgBootstrapResolved || Boolean(activeOrgId)) &&
      (seatLevel === "person" || !activeOrgId || !roleLoading),
  });
  const actions = useIntelligenceActions({
    level: seatLevel,
    organizationId: activeOrgId,
  });

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverPlace, setHoverPlace] = useState<string | null>(null);
  const [ownFor, setOwnFor] = useState<FeatureIntelligenceRow | null>(null);

  const featureLabel =
    declaredPlacesFor(feature)?.label ?? state.rows[0]?.featureLabel ?? titleCase(feature);
  const whoFor = orgLevel ? (activeOrgName ?? "your organization") : "you";

  // Bring the focused job into view once the rows are on screen.
  const focusReady = state.rows.some((row) => row.mandateKey === focusMandateKey);
  useEffect(() => {
    if (!focusMandateKey || !focusReady) return;
    document
      .getElementById(`intelligence-${focusMandateKey}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusMandateKey, focusReady]);

  const placeKeys = new Set(state.places.flatMap((place) => place.mandateKeys));
  const unrecorded = state.rows.filter((row) => !placeKeys.has(row.mandateKey)).length;
  const hoveredPlaceKeys = hoverPlace
    ? new Set(state.places.find((place) => place.id === hoverPlace)?.mandateKeys ?? [])
    : null;
  const activeKey = hoverKey ?? (hoverPlace ? null : focusMandateKey);

  return (
    <div className={cn("mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 lg:px-8 lg:py-7", className)}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {showTitle ? (
            <h1 className="mb-1 flex items-center gap-2 text-[22px] font-semibold tracking-[-0.015em] text-foreground">
              <BrainCircuit className="h-5 w-5 text-primary" aria-hidden />
              {featureLabel} intelligence
            </h1>
          ) : null}
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            The AI jobs in {featureLabel}, what runs each one for {whoFor}, and where it
            runs. Duplicate one to change it, or use your own.
          </p>
        </div>
        {canManageOrg ? (
          <div
            role="radiogroup"
            aria-label="Manage for"
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
          >
            {(
              [
                ["person", "For me"],
                ["organization", `For ${activeOrgName ?? "organization"}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={level === value}
                onClick={() => setLevel(value)}
                className={cn(
                  "max-w-[14rem] truncate rounded-md px-3 py-1 text-[13px] transition-colors",
                  level === value
                    ? "bg-card font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <section className="mb-5" aria-labelledby="intelligence-places">
        <h2
          id="intelligence-places"
          className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Where it runs
        </h2>
        {state.loading ? (
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-12 w-[11.5rem] animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <PlacesMap
            places={state.places}
            activeMandateKey={activeKey}
            activePlaceId={hoverPlace}
            onHoverPlace={setHoverPlace}
            unrecordedCount={unrecorded}
          />
        )}
        {state.placesError ? (
          <p className="mt-1 text-[11px] text-destructive">
            Some places could not be read: {state.placesError}
          </p>
        ) : null}
      </section>

      {state.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          The jobs could not be read: {state.error}
        </div>
      ) : state.loading ? (
        <div className="flex min-h-[30dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading jobs" />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          No AI jobs are recorded for {featureLabel} yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {state.rows.map((row) => {
            const topicChoice = effectiveRunOverride(row, runOverrides[row.mandateKey]);
            return <IntelligenceJobCard
              key={row.id}
              row={row}
              places={state.places}
              focused={
                row.mandateKey === focusMandateKey ||
                (hoveredPlaceKeys?.has(row.mandateKey) ?? false)
              }
              orgLevel={orgLevel}
              organizationId={activeOrgId}
              busy={actions.busyKey === row.mandateKey}
              canReset={Boolean(topicChoice && !orgLevel) || row.decidedRung === rungFor(seatLevel)}
              resetLabel={topicChoice && !orgLevel
                ? "Remove topic choice"
                : orgLevel ? "Remove organization choice" : "Remove my choice"}
              detailsHref={memberMandateRecordHref(
                seatLevel,
                row.mandateKey,
                orgLevel ? activeOrgId : null,
              )}
              runOverride={topicChoice}
              onHover={setHoverKey}
              onDuplicate={() => void actions.duplicateAndModify(row, {
                // An unverified topic choice remains the exact source. If it
                // cannot be copied, leave the topic choice untouched instead
                // of replacing it with a copy of a different mandate holder.
                effectiveTopicAgentId: topicChoice?.health === "unavailable" ? undefined : topicChoice?.holderId,
                afterBind: topicChoice && clearRunOverride
                  ? () => clearRunOverride(row.mandateKey)
                  : undefined,
              })}
              onUseOwn={() => setOwnFor(row)}
              onReset={() => {
                if (topicChoice && !orgLevel && clearRunOverride) {
                  void clearRunOverride(row.mandateKey).then(
                    () => toast.success("This topic now uses the active mandate choice."),
                    (error: unknown) => toast.error(error instanceof Error ? error.message : String(error)),
                  );
                } else {
                  void actions.resetToDefault(row);
                }
              }}
            />;
          })}
        </ul>
      )}

      {ownFor ? (
        <UseOwnDialog
          row={ownFor}
          whoFor={whoFor}
          busy={actions.busyKey === ownFor.mandateKey}
          onClose={() => setOwnFor(null)}
          onSave={(draft) => actions.setOwn(
            ownFor,
            draft,
            effectiveRunOverride(ownFor, runOverrides[ownFor.mandateKey]) && clearRunOverride
              ? () => clearRunOverride(ownFor.mandateKey)
              : undefined,
          )}
        />
      ) : null}
    </div>
  );
}
