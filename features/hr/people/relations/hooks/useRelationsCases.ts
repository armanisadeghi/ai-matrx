// features/hr/people/relations/hooks/useRelationsCases.ts
//
// The data hooks behind routes 15 and 16.
//
// 🚨 NEVER LET A REFUSAL LOOK LIKE AN EMPTY LIST. These hooks keep `refusal`
// and `cases` strictly separate: a refusal leaves `cases` at `null`, never at
// `[]`. A surface that renders `cases ?? []` into a table would silently turn
// "not yours to see" into "there's nothing here", which is the exact defect the
// envelope contract exists to prevent.

"use client";

import { useCallback, useEffect, useState } from "react";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import {
  fetchHrCaseRestrictedNotes,
  fetchHrIncidentParties,
  fetchHrRelationsCase,
  fetchHrRelationsCases,
  type HrRelationsFilter,
  type HrRelationsList,
} from "../service";
import type { HrCaseDetail, HrCaseKind } from "../types";

export type HrRelationsCasesState = {
  list: HrRelationsList | null;
  isLoading: boolean;
  /** A refusal OR a failure. `HrPageState` tells them apart and renders each. */
  error: HrDenied | HrFailed | null;
  /** True when the refusal was a DENIAL — the route and nav item are absent. */
  denied: boolean;
  refresh: () => void;
};

export function useHrRelationsCases(
  filter: HrRelationsFilter,
): HrRelationsCasesState {
  const { active, isLoading: contextLoading } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [list, setList] = useState<HrRelationsList | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // Serialized so the effect re-runs on a real filter change and not on every
  // render's fresh object identity. React Compiler is on — this is a dependency
  // key, not a hand-rolled memo.
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrRelationsCases(
        organizationId,
        JSON.parse(filterKey) as HrRelationsFilter,
      );
      if (cancelled) return;
      if (result.ok) {
        setList(result.data);
        setError(null);
      } else {
        // The list stays NULL. Not an empty array. See the header.
        setList(null);
        setError(result);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, filterKey, reloadToken]);

  return {
    list,
    isLoading: contextLoading || isLoading,
    error,
    denied: error?.kind === "denied",
    refresh,
  };
}

export type HrRelationsCaseState = {
  detail: HrCaseDetail | null;
  caseKind: HrCaseKind | null;
  isLoading: boolean;
  error: HrDenied | HrFailed | null;
  denied: boolean;
  refresh: () => void;
};

/**
 * Which allow lane the SERVER used, turned into the word the surface reasons
 * with. `basis` is `hr._door_verdict`'s own answer — `self`, `role`,
 * `authority` (an `investigator` party row), or `break_glass` — so this is a
 * translation, never an inference about who the viewer is.
 *
 * 🚨 THIS IS AN AFFORDANCE, NOT A GATE. Every write on this page is refused by
 * its own door on the server's reading of the caller. Getting this wrong shows
 * or hides a button; it can never grant anything.
 */
function viewerRoleFromBasis(
  basis: string | null,
  isSelfAccess: boolean,
  caseKind: HrCaseKind,
  row: Record<string, unknown>,
  viewerEmploymentId: string | null,
): HrCaseDetail["viewer_role"] {
  if (basis === "authority") return "investigator";
  if (basis === "self" || isSelfAccess) {
    // On a corrective action the self lane covers BOTH the subject and the
    // issuer (`created_by`), and the panel has to tell them apart: the subject
    // may not record their own acknowledgment as if they were the issuer. The
    // row's own subject column is the discriminator.
    if (caseKind === "corrective_action") {
      return viewerEmploymentId && row.employment_id === viewerEmploymentId
        ? "subject"
        : "issuer";
    }
    return "subject";
  }
  return "hr";
}

/**
 * One case, either kind.
 *
 * When `hintedKind` is null (a link that dropped `?kind=`) this probes the
 * incident door first and the corrective-action door second. The losing probe
 * writes a denial to `hr.access_audit`, which is correct behaviour, not a bug —
 * see `hrRelationsCaseHref`.
 *
 * 🚨 THE VETO CAN FIRE BETWEEN TWO READS. Adding an `accused` party
 * re-materializes the exclusion set in the same transaction, so a viewer who
 * just accused themselves loses reach on their very NEXT request. When
 * `refresh()` comes back denied on a case that was open a second ago, the
 * surface redirects with a NEUTRAL message — it never explains why.
 *
 * 🚨 THE CASE PAGE RENDERED A HEADING AND NOTHING ELSE, FOR A YEAR OF BUILD.
 * This hook did `setDetail(result.data.row)` — and `row` is `hr._project_row`'s
 * output: the FLAT `hr.incident` (or `hr.corrective_action`) record plus a
 * `subject_name`. `CaseSurface` reads `detail?.incident`, `detail?.parties`,
 * `detail?.restricted_notes` and `detail?.viewer_role`, and not one of those
 * keys has ever existed on that payload. So every panel below the header —
 * state, parties, OSHA, notes, the corrective-action block — was gated on
 * `undefined` and silently did not render, on every case, for every viewer.
 *
 * 🚨 AND THE FIX IS **NOT** A FATTER DOOR. §2.2 route 16 names three reads and
 * keeps them apart on purpose: `hr_restricted_get` for the record;
 * `hr.incident_party` "(component, conveyed by the parent's reach)"; and
 * `hr.restricted_note` "only through its own owner lane". Folding parties and
 * notes into the case payload would convey a note by the parent's reach, which
 * is the exact thing SPEC-DATA-MODEL forbids in as many words — "making it a
 * component of `hr.incident` would hand it to everyone who can read the
 * incident". So this hook composes three audited reads and each one is
 * separately refusable. A component the viewer may not have simply comes back
 * empty, and an absent key stays absent: `RestrictedNotesPanel` renders NOTHING
 * for `undefined`, which is its own documented law.
 */
export function useHrRelationsCase(args: {
  caseId: string;
  hintedKind: HrCaseKind | null;
  justification: string;
}): HrRelationsCaseState {
  const { caseId, hintedKind, justification } = args;
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const viewerEmploymentId = active?.employment_id ?? null;

  const [detail, setDetail] = useState<HrCaseDetail | null>(null);
  const [caseKind, setCaseKind] = useState<HrCaseKind | null>(hintedKind);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const order: HrCaseKind[] = hintedKind
        ? [hintedKind]
        : ["incident", "corrective_action"];

      /*
        🚨 A REFUSAL OUTRANKS A PROBE FAILURE, AND THIS KEPT THE WRONG ONE.

        With no hinted kind we ask the incident door and then the corrective-
        action door, because the URL does not say which one a case id is. Only
        ONE of those doors can ever hold the row, so the other ALWAYS fails —
        `hr_corrective_action` raises `P0002: no ... row with id <uuid>` for
        every incident id in the product.

        This loop kept `lastFailure`, so that guaranteed probe miss overwrote
        the door's real answer. Live, 2026-08-30, as an ACCUSED party: the
        incident door returned the SPEC-ACCESS §5 subject-exclusion veto —
        `{granted:false, reason:'subject_excluded'}` — and the page rendered
        *"That record could not be loaded"* with a Try-again button that can
        never succeed, because the corrective-action probe answered last. The
        §5 veto, the strongest refusal in the module, was thrown away by a loop
        variable and shown to the person it exists to protect as a transient
        error.

        A `denied` is the door speaking about the CALLER and is always the truth
        worth keeping; a `failed` is a probe that asked the wrong door. So the
        first denial wins and later failures cannot displace it.
      */
      let lastFailure: HrDenied | HrFailed | null = null;
      let firstDenial: HrDenied | null = null;

      for (const kind of order) {
        const result = await fetchHrRelationsCase({
          caseKind: kind,
          caseId,
          justification,
        });
        if (cancelled) return;
        if (!result.ok) {
          if (result.kind === "denied" && !firstDenial) firstDenial = result;
          lastFailure = result;
          continue;
        }

        const audited = result.data;
        const row = audited.row as unknown as Record<string, unknown>;

        // The two component reads. They ride the parent's reach and are asked
        // for only once the parent has actually answered — a parties call on a
        // case the viewer was just refused would write a second, meaningless
        // denial into their audit trail.
        const [parties, notes] = await Promise.all([
          kind === "incident"
            ? fetchHrIncidentParties(organizationId, caseId)
            : Promise.resolve(null),
          fetchHrCaseRestrictedNotes(organizationId, kind, caseId),
        ]);
        if (cancelled) return;

        setDetail({
          case_kind: kind,
          incident: kind === "incident" ? (row as never) : undefined,
          corrective_action:
            kind === "corrective_action" ? (row as never) : undefined,
          // A refused or failed component leaves the key ABSENT, never `[]`.
          // "Nobody recorded yet" and "not yours to see" are different sentences
          // here too, and the panels are written to say neither when they were
          // told nothing.
          parties: parties?.ok ? parties.data : undefined,
          restricted_notes: notes.ok ? notes.data : undefined,
          viewer_role: viewerRoleFromBasis(
            audited.basis,
            audited.isSelfAccess,
            kind,
            row,
            viewerEmploymentId,
          ),
        });
        setCaseKind(kind);
        setError(null);
        setIsLoading(false);
        return;
      }

      setDetail(null);
      setError(firstDenial ?? lastFailure);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    caseId,
    hintedKind,
    justification,
    reloadToken,
    organizationId,
    viewerEmploymentId,
  ]);

  return {
    detail,
    caseKind,
    isLoading,
    error,
    denied: error?.kind === "denied",
    refresh,
  };
}
