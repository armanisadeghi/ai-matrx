"use client";

// features/mandates/member-list/MandateMemberPeek.tsx
//
// The mandate quick look for the non-admin lists — the admin `MandatePeek`
// pattern (../admin-list/MandatePeek.tsx: compact dialog, ← → through the rows
// on screen, Open in the footer) over the member row. It shows what a mandate
// is from this seat: feature, goal, who runs it for me (or for this
// organization's members), who decided that, and who customized it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { agentHref } from "@/features/mandates/admin/mandate-health";
import { MemberHealthBadge, VISIBILITY_WORDS } from "./columns";
import type { MandateListLevel, MandateMemberRow } from "./types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-28 shrink-0 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

export function MandateMemberPeek({
  rowId,
  rows,
  level,
  hrefFor,
  onClose,
}: {
  rowId: string;
  rows: MandateMemberRow[];
  level: MandateListLevel;
  hrefFor: (row: MandateMemberRow) => string;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState(rowId);
  const [goalOpen, setGoalOpen] = useState(false);
  useEffect(() => setCurrentId(rowId), [rowId]);

  const index = rows.findIndex((r) => r.id === currentId);
  const row = index >= 0 ? rows[index] : null;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < rows.length - 1;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
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
        </div>
        <div className="max-h-[65dvh] divide-y divide-border/60 overflow-y-auto">
          <Field label="Feature">{row.featureLabel}</Field>
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
          <Field label={level === "organization" ? "Runs for members" : "Runs for you"}>
            {row.holderType === "agent" && row.holderId ? (
              <EntityRef
                token="agent"
                id={row.holderId}
                name={row.holderName}
                href={agentHref(row.holderId, null)}
                showIcon={false}
              />
            ) : (
              <span className={row.holderId ? "" : "text-muted-foreground"}>{row.holderName}</span>
            )}
          </Field>
          <Field label="Decided by">{row.decidedBy}</Field>
          <Field label="Version">{row.pinText}</Field>
          <Field label="Customized by">{row.customizedBy.join(", ")}</Field>
          <Field label="Health">
            <MemberHealthBadge health={row.health} />
          </Field>
          <Field label="Owner">{row.homeLabel}</Field>
          {row.origin === "soft" ? (
            <Field label="Visible to">{VISIBILITY_WORDS[row.visibility] ?? row.visibility}</Field>
          ) : null}
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
