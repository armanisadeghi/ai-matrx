"use client";

// features/mandates/feature-intelligence/card-options/CardOptionsDemo.tsx
//
// /intelligence/card-options — ten layouts of the Intelligence job card, each
// rendering the SAME three real research mandates with the live data and the
// live controls (Arman, 2026-09-26). The seat works as on the real page: For me
// writes my own choice; an owner/admin of the active organization can switch to
// the organization seat and set its default.

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectPersonalOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserRole } from "@/features/organizations/hooks";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { memberMandateRecordHref } from "../../member-list/routes";
import { useFeatureIntelligence } from "../useFeatureIntelligence";
import { useIntelligenceActions } from "../useIntelligenceActions";
import { UseOwnDialog } from "../UseOwnDialog";
import type { FeatureIntelligenceRow, IntelligenceLevel } from "../types";
import { CARD_OPTIONS } from "./options";
import type { JobContext } from "./parts";

/** The three jobs every option shows — real research mandates. */
const PREFERRED_KEYS = [
  "research.topic_deep_research",
  "research.topic_auto_tagger",
  "research.topic_synthesize",
];

const NO_CONTEXT = {};

export function CardOptionsDemo() {
  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const personalOrgId = useAppSelector(selectPersonalOrganizationId);
  const userId = useAppSelector(selectUserId);
  const { organizationState } = useOrganizationRequired();
  const { isAdmin, loading: roleLoading } = useUserRole(activeOrgId ?? undefined);
  const canManageOrg = Boolean(activeOrgId) && activeOrgId !== personalOrgId && isAdmin;
  const [level, setLevel] = useState<IntelligenceLevel>("person");
  const seatLevel: IntelligenceLevel = canManageOrg ? level : "person";
  const orgLevel = seatLevel === "organization";

  const state = useFeatureIntelligence({
    feature: "research",
    level: seatLevel,
    organizationId: activeOrgId,
    userId,
    context: NO_CONTEXT,
    enabled: organizationState !== "resolving" && (seatLevel === "person" || !activeOrgId || !roleLoading),
  });
  const actions = useIntelligenceActions({ level: seatLevel, organizationId: activeOrgId });
  const [ownFor, setOwnFor] = useState<FeatureIntelligenceRow | null>(null);

  const rows = useMemo(() => {
    const picked = PREFERRED_KEYS.map((key) => state.rows.find((row) => row.mandateKey === key)).filter(
      (row): row is FeatureIntelligenceRow => Boolean(row),
    );
    for (const row of state.rows) {
      if (picked.length >= 3) break;
      if (!picked.includes(row)) picked.push(row);
    }
    return picked;
  }, [state.rows]);

  const ctxFor = (row: FeatureIntelligenceRow): JobContext => ({
    places: state.places,
    orgLevel,
    organizationId: activeOrgId,
    organizationName: activeOrgName,
    busy: actions.busyKey === row.mandateKey,
    detailsHref: memberMandateRecordHref(seatLevel, row.mandateKey, orgLevel ? activeOrgId : null),
    onDuplicate: () => void actions.duplicateAndModify(row),
    onUseOwn: () => setOwnFor(row),
    onReset: () => void actions.resetToDefault(row),
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-[18px] font-semibold text-foreground">
          <INTELLIGENCE_ICON className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden />
          <span className="truncate">Job card options</span>
        </h1>
        {canManageOrg ? (
          <div role="radiogroup" aria-label="Manage for" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {([
              ["person", "For me"],
              ["organization", `For ${activeOrgName ?? "organization"}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={level === value}
                onClick={() => setLevel(value)}
                className={cn(
                  "max-w-[12rem] truncate rounded-md px-3 py-1 text-[13px] transition-colors",
                  level === value ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <nav aria-label="Options" className="sticky top-0 z-10 -mx-1 mb-5 flex gap-1 overflow-x-auto bg-textured/90 px-1 py-1.5 backdrop-blur">
        {CARD_OPTIONS.map(({ n }) => (
          <a
            key={n}
            href={`#option-${n}`}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-[13px] font-medium tabular-nums text-foreground hover:border-primary/50"
          >
            {n}
          </a>
        ))}
      </nav>

      {state.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          The jobs could not be read: {state.error}
          <ErrorAlchemyMenu error={state.error} />
        </div>
      ) : state.loading && rows.length === 0 ? (
        <div className="flex min-h-[30dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading jobs" />
        </div>
      ) : (
        <div className="space-y-10">
          {CARD_OPTIONS.map(({ n, name, Option }) => (
            <section key={n} id={`option-${n}`} className="scroll-mt-16" aria-labelledby={`option-${n}-title`}>
              <h2 id={`option-${n}-title`} className="mb-3 flex items-baseline gap-2 text-[15px] font-semibold text-foreground">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary px-1.5 text-[12px] tabular-nums text-primary-foreground">
                  {n}
                </span>
                {name}
              </h2>
              <Option rows={rows} ctxFor={ctxFor} />
            </section>
          ))}
        </div>
      )}

      {ownFor ? (
        <UseOwnDialog
          row={ownFor}
          whoFor={orgLevel ? (activeOrgName ?? "your organization") : "you"}
          busy={actions.busyKey === ownFor.mandateKey}
          onClose={() => setOwnFor(null)}
          onSave={(draft) => actions.setOwn(ownFor, draft)}
        />
      ) : null}
    </div>
  );
}
