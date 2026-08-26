// features/hr/people/verifications/components/VerificationsSurface.tsx
//
// ROUTE 17 — employment and income verification letters.
//
// 🚨 GENERATE IS **DISABLED UNTIL CONSENT EXISTS** WHEN THE LETTER INCLUDES
// COMPENSATION. Deliberately disabled and not absent: the person looking at
// this row is HR, the control is legitimately theirs, and what they need to
// know is *what is missing and who they are waiting on*. That is the opposite
// of the sensitivity rule's case, where the control belongs to someone else
// entirely. The gate is also a table CHECK and an aidream check — three places,
// on purpose.
//
// 🚨 A REGENERATE WRITES A NEW ROW, NEVER AN EDIT. A delivered letter is an
// assertion the organization is held to; the server answers 409 and this
// surface renders the create-a-new-request path.
//
// 🚨 A 403 `hr_verification_consent_missing` IS A STATE, NOT AN ERROR TOAST.

"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCheck2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MatrxDataTable from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useBackendApi } from "@/hooks/useBackendApi";
import { toast } from "@/lib/toast";
import { HrPageState, hrErrorSentence } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useHrPersona } from "@/features/hr/shared/useHrPersona";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import {
  fetchHrVerificationLetters,
  generateHrVerificationLetter,
} from "../service";
import {
  HR_VERIFICATION_KIND_LABELS,
  HR_VERIFICATION_SOURCE_LABELS,
  HR_VERIFICATION_STATE_LABELS,
  toVerificationState,
  type HrVerificationKind,
  type HrVerificationLetterRow,
  type HrVerificationSource,
} from "../types";
import { NewVerificationRequestDialog } from "./NewVerificationRequestDialog";
import { VerificationRowActions } from "./VerificationRowActions";

function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function VerificationsSurface() {
  const { active } = useHrContext();
  const { can } = useHrPersona();
  const api = useBackendApi();

  const [rows, setRows] = useState<HrVerificationLetterRow[] | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);
  const organizationId = active?.organization_id ?? null;

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrVerificationLetters({});
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data.rows ?? []);
        setError(null);
      } else {
        // A refusal leaves the rows NULL, never an empty array — "not yours to
        // see" must not render as "there are no requests".
        setRows(null);
        setError(result);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadToken]);

  const canGenerate = can("identity.write") || can("working_record.write");

  const generate = useCallback(
    async (row: HrVerificationLetterRow) => {
      if (!organizationId) return;
      setBusyId(row.id);
      const outcome = await generateHrVerificationLetter({
        request: api.fetch,
        letterId: row.id,
        organizationId,
        includesCompensation: Boolean(row.includes_compensation),
        recipient: row.requester_email ?? row.requester_name ?? null,
      });
      setBusyId(null);

      switch (outcome.kind) {
        case "generated":
          toast.success("Letter generated");
          refresh();
          return;
        case "awaiting_consent":
          // A STATE, not an error. Say who we are waiting on.
          toast.message(
            "This letter states income, so it waits on the employee's consent. They have been asked.",
          );
          refresh();
          return;
        case "already_delivered":
          toast.message(
            "This letter has already been delivered and cannot be changed. Raise a new request instead.",
          );
          refresh();
          return;
        case "failed":
          toast.error(outcome.message);
      }
    },
    [api.fetch, organizationId, refresh],
  );

  const columns: MatrxColumnDef<HrVerificationLetterRow>[] = [
    {
      id: "subject",
      accessorFn: (row) => row.subject_name ?? "",
      header: "About",
      filter: "auto",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {row.subject_name ?? "Not on record here"}
          </span>
          {/* A former employee's letter reads in the past tense — say so where
              the reader will act on it. */}
          {row.subject_employment_ended_on ? (
            <span className="block text-xs text-muted-foreground">
              Employment ended {formatDay(row.subject_employment_ended_on)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "kind",
      accessorFn: (row) =>
        HR_VERIFICATION_KIND_LABELS[
          row.verification_kind as HrVerificationKind
        ] ?? String(row.verification_kind),
      header: "Covers",
      filter: "select",
    },
    {
      id: "source",
      accessorFn: (row) =>
        HR_VERIFICATION_SOURCE_LABELS[
          row.request_source as HrVerificationSource
        ] ?? String(row.request_source),
      header: "Asked by",
      filter: "select",
    },
    {
      id: "requester",
      accessorFn: (row) =>
        row.requester_organization ?? row.requester_name ?? "",
      header: "Requester",
      filter: "auto",
    },
    {
      id: "state",
      accessorFn: (row) =>
        HR_VERIFICATION_STATE_LABELS[toVerificationState(String(row.state))],
      header: "State",
      filter: "select",
      cell: (row) => {
        const state = toVerificationState(String(row.state));
        return (
          <Badge
            variant={state === "denied" ? "destructive" : "outline"}
            className="text-xs"
          >
            {HR_VERIFICATION_STATE_LABELS[state]}
          </Badge>
        );
      },
    },
    {
      id: "requested",
      accessorFn: (row) => row.requested_at ?? "",
      header: "Requested",
      filter: "auto",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {formatDay(row.requested_at)}
        </span>
      ),
    },
    {
      id: "denial",
      accessorFn: (row) => row.denial_basis ?? "",
      header: "Denial basis",
      filter: "select",
      // The denial IS the record. It renders as a plain, readable fact.
      cell: (row) =>
        row.denial_basis ? (
          <span className="text-sm text-muted-foreground">
            {row.denial_basis.replace(/_/g, " ")}
          </span>
        ) : null,
    },
  ];

  return (
    <HrPageState
      loading={isLoading}
      error={error && error.kind === "failed" ? error : null}
      granted={error?.kind === "denied" ? false : undefined}
      operation="Verification letters"
      variant="table"
      onRetry={refresh}
    >
      <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
        <MatrxDataTable<HrVerificationLetterRow>
          data={rows ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          pageSize={25}
          rowActions={(row) => (
            <VerificationRowActions
              row={row}
              busy={busyId === row.id}
              canGenerate={canGenerate}
              onGenerate={() => generate(row)}
              onChanged={refresh}
            />
          )}
          toolbar={{
            search: true,
            searchPlaceholder: "Search requests",
            actions: canGenerate ? (
              <Button
                type="button"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => setCreating(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New request
              </Button>
            ) : null,
          }}
          emptyState={{
            icon: <FileCheck2 className="h-8 w-8 text-muted-foreground" />,
            title: "No verification requests",
            description:
              "Requests from employees, lenders and agencies appear here, along with every letter this organization has asserted.",
          }}
        />
      </div>

      {creating ? (
        <NewVerificationRequestDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
          onFailed={(result) =>
            toast.error(hrErrorSentence(result, "Raising this request"))
          }
        />
      ) : null}
    </HrPageState>
  );
}
