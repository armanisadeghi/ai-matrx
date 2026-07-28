"use client";

// features/crm/components/record/EmploymentCard.tsx
//
// Employment = crm.affiliation, a REAL table with dates and history — never
// an association edge (an edge can hold only one works_at per pair, ever, and
// unlinking erases that it happened; see features/crm/FEATURE.md).
//
// Person view: current + past employers, add a stint, end a stint.
// Company view: everyone who works / worked here (read-only rows that link
// to the person).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Briefcase, Building2, LogOut, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import {
  addAffiliation,
  endAffiliation,
  searchEmployerCandidates,
} from "../../service";
import type {
  AffiliationWithEmployer,
  AffiliationWithPerson,
  PartyRef,
} from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

function stintDates(startDate: string | null, endDate: string | null): string {
  const start = startDate ? startDate.slice(0, 7) : "?";
  const end = endDate ? endDate.slice(0, 7) : "now";
  return `${start} → ${end}`;
}

// ── Person side ─────────────────────────────────────────────────────────────

interface PersonProps {
  mode: "person";
  partyId: string;
  orgId: string;
  affiliations: AffiliationWithEmployer[];
  onChanged: () => Promise<void>;
}

// ── Company side ────────────────────────────────────────────────────────────

interface CompanyProps {
  mode: "company";
  partyId: string;
  orgId: string;
  members: AffiliationWithPerson[];
  onChanged: () => Promise<void>;
}

type Props = PersonProps | CompanyProps;

function EmployerPicker({
  orgId,
  excludeId,
  selected,
  onSelect,
}: {
  orgId: string;
  excludeId: string;
  selected: PartyRef | null;
  onSelect: (party: PartyRef | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<PartyRef[]>([]);
  const [open, setOpen] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const gen = ++generationRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchEmployerCandidates({
            orgId,
            search,
            excludeId,
          });
          if (generationRef.current === gen) setOptions(rows);
        } catch (e) {
          console.error("[crm] employer search failed:", e);
        }
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [open, search, orgId, excludeId]);

  if (selected) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2 text-xs text-foreground">
        <Building2 className="h-3 w-3 text-muted-foreground" />
        {selected.display_name}
        <button
          type="button"
          aria-label="Clear employer"
          onClick={() => onSelect(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <div className="relative min-w-[11rem] flex-1">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search companies…"
        className="h-7 text-xs"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
              >
                <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{option.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmploymentCard(props: Props) {
  const [adding, setAdding] = useState(false);
  const [employer, setEmployer] = useState<PartyRef | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPerson = props.mode === "person";
  const rows = isPerson ? props.affiliations : props.members;

  const submit = async () => {
    if (!isPerson) return;
    if (!employer) {
      toast.error("Pick an employer company");
      return;
    }
    setSaving(true);
    try {
      const hasCurrentPrimary = props.affiliations.some(
        (a) => a.is_current && a.is_primary,
      );
      await addAffiliation({
        partyId: props.partyId,
        employerPartyId: employer.id,
        orgId: props.orgId,
        title: title || undefined,
        startDate: startDate || null,
        isCurrent,
        // First current stint becomes the primary employer (grids/sort read
        // party.primary_employer_party_id, maintained by crm._affiliation_edge).
        isPrimary: isCurrent && !hasCurrentPrimary,
      });
      setEmployer(null);
      setTitle("");
      setStartDate("");
      setIsCurrent(true);
      setAdding(false);
      await props.onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add employment");
    } finally {
      setSaving(false);
    }
  };

  const end = async (id: string, name: string) => {
    const ok = await confirm({
      title: `End the stint at ${name}?`,
      description: "The history stays — nothing is erased.",
      confirmLabel: "End stint",
    });
    if (!ok) return;
    try {
      await endAffiliation(id);
      await props.onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end stint");
    }
  };

  return (
    <SectionCard
      title={isPerson ? "Employment" : "People"}
      Icon={isPerson ? Briefcase : Users}
      count={rows.length}
      action={
        isPerson ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-label={adding ? "Cancel add" : "Add employment"}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {adding ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        ) : undefined
      }
    >
      {isPerson && adding && (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-muted/30 p-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <EmployerPicker
              orgId={props.orgId}
              excludeId={props.partyId}
              selected={employer}
              onSelect={setEmployer}
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-7 w-32 text-xs"
            />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7 w-32 text-xs"
              aria-label="Start date"
            />
            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <Checkbox
                checked={isCurrent}
                onCheckedChange={(v) => setIsCurrent(v === true)}
              />
              Current
            </label>
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={submit}
              disabled={saving || !employer}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <SectionEmpty>
          {isPerson ? "No employment on record" : "No people on record"}
        </SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {isPerson
            ? props.affiliations.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
                >
                  <Building2
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      a.is_current
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                    )}
                  />
                  {a.employer ? (
                    <Link
                      href={`/crm/${a.employer.id}`}
                      className={cn(
                        "min-w-0 truncate text-sm hover:underline",
                        a.is_current
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {a.employer.display_name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown company
                    </span>
                  )}
                  {a.title && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {a.title}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {stintDates(a.start_date, a.end_date)}
                  </span>
                  {a.is_current ? (
                    <button
                      type="button"
                      aria-label="End this stint"
                      title="End this stint"
                      onClick={() =>
                        void end(a.id, a.employer?.display_name ?? "this company")
                      }
                      className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span
                      className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                    >
                      Past
                    </span>
                  )}
                </li>
              ))
            : props.members.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
                >
                  {a.person ? (
                    <Link
                      href={`/crm/${a.person.id}`}
                      className={cn(
                        "min-w-0 truncate text-sm hover:underline",
                        a.is_current
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {a.person.display_name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown person
                    </span>
                  )}
                  {a.title && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {a.title}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {stintDates(a.start_date, a.end_date)}
                  </span>
                  {!a.is_current && (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                      Past
                    </span>
                  )}
                </li>
              ))}
        </ul>
      )}
    </SectionCard>
  );
}
