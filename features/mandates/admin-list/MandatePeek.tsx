"use client";

// features/mandates/admin-list/MandatePeek.tsx
//
// The mandate quick look — the agents' `AgentSneakPeekModal` pattern (a
// compact dialog, prev/next through the rows on screen with ← →, Open in the
// footer), carrying exactly what a mandate IS: name, feature, inputs, goal,
// output, and its binding (Mandate Holder, pin, customized by).

import { MandateStatusControl } from "@/features/mandates/status/MandateStatusControl";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { adminMandateRecordHref as adminMandateHref } from "@/features/mandates/admin-routes";
import { agentHref } from "@/features/mandates/admin/mandate-health";
import {
  MandateInputsCell,
  MandateOutputCell,
} from "@/features/mandates/admin/mandate-contract-cells";
import { useMandateAdminListState } from "./context";
import type { MandateAdminRow } from "./types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-28 shrink-0 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

export function MandatePeekContent({ row }: { row: MandateAdminRow }) {
  const { offersByProvision } = useMandateAdminListState();
  const [goalOpen, setGoalOpen] = useState(false);
  return (
    <div className="divide-y divide-border/60">
      <Field label="Feature">{row.featureLabel}</Field>
      <Field label="Inputs">
        <MandateInputsCell
          row={row}
          offeredValues={
            row.provisionKey
              ? offersByProvision.get(row.provisionKey)
              : undefined
          }
        />
      </Field>
      <Field label="Goal">
        {row.goal ? (
          <button
            type="button"
            onClick={() => setGoalOpen((open) => !open)}
            className={`text-left text-sm ${goalOpen ? "" : "line-clamp-3"}`}
            title={goalOpen ? "Show less" : "Show all"}
          >
            {row.goal}
          </button>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </Field>
      <Field label="Output">
        <MandateOutputCell row={row} />
      </Field>
      <Field label="Mandate Holder">
        {row.holderType !== "agent" ? (
          <span>Workflow</span>
        ) : row.agentId ? (
          <EntityRef
            token="agent"
            id={row.agentId}
            name={row.agentName}
            href={agentHref(row.agentId, row.agentType)}
            showIcon={false}
          />
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </Field>
      <Field label="Version">{row.pinText}</Field>
      <Field label="Customized by">{row.customizedBy.join(", ")}</Field>
    </div>
  );
}

export function MandatePeek({
  rowId,
  rows,
  onClose,
  hrefFor = (row) => adminMandateHref(row.mandateKey),
}: {
  rowId: string;
  /** The rows on screen, for ← → navigation. */
  rows: MandateAdminRow[];
  onClose: () => void;
  /** Where Open goes — the lane's record page (management by key, support by id). */
  hrefFor?: (row: MandateAdminRow) => string;
}) {
  const [currentId, setCurrentId] = useState(rowId);
  useEffect(() => setCurrentId(rowId), [rowId]);

  const index = rows.findIndex((r) => r.id === currentId);
  const row = index >= 0 ? rows[index] : null;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < rows.length - 1;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key === "ArrowLeft" && hasPrev) {
        event.preventDefault();
        setCurrentId(rows[index - 1].id);
      } else if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        setCurrentId(rows[index + 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasNext, hasPrev, index, rows]);

  if (!row) return null;
  const href = hrefFor(row);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg gap-2 border border-border bg-card p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 pr-6">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => hasPrev && setCurrentId(rows[index - 1].id)}
            disabled={!hasPrev}
            aria-label="Previous (←)"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => hasNext && setCurrentId(rows[index + 1].id)}
            disabled={!hasNext}
            aria-label="Next (→)"
          >
            <ChevronRight />
          </Button>
          <DialogTitle className="min-w-0 truncate text-base font-semibold">
            <Link href={href} onClick={onClose} className="hover:underline">
              {row.name}
            </Link>
          </DialogTitle>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in a new tab"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <MandateStatusControl
            mandateId={row.id}
            name={row.name}
            status={row.status}
            canManage
            size="md"
            className="ml-auto"
          />
        </div>
        <div className="max-h-[65dvh] overflow-y-auto">
          <MandatePeekContent row={row} />
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {index + 1} / {rows.length}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            Close
          </Button>
          <Button asChild size="sm">
            <Link href={href} onClick={onClose}>
              Open
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
