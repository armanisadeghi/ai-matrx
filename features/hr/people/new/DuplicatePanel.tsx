"use client";

// features/hr/people/new/DuplicatePanel.tsx — §4.1
//
// 🚨 MATCHES RENDER WITH DOORS. Every suspected duplicate opens — a match you
// cannot look at is a match you cannot rule out, so the only thing left to do is
// click past it.
//
// 🚨 "CONTINUE ANYWAY" REQUIRES AN EXPLICIT NOT-THE-SAME-PERSON TICK. Not a
// second press of the same button, not a countdown: a checkbox the user has to
// physically assert. Creating a duplicate person is one of the few HR mistakes
// that cannot be cleanly undone — a second `hr.employee` row for one party is
// forbidden by constraint precisely because merging them afterwards is not
// possible.
//
// 🚨 A SCAN THAT SKIPPED A LEG IS NOT A CLEAN SCAN, AND SAYS SO. The SSN leg
// needs an HMAC only aidream can compute (the key never enters the database), so
// it is frequently skipped. "No matches" from a name-only scan is a much weaker
// statement than "no matches" from a full one, and the difference is the whole
// point of showing it.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { hrEmployeeHref } from "../../routes";
import { HrStatusChip } from "../shared/HrStatusChip";

export type HrDuplicateMatch = {
  employee_id: string;
  display_name: string;
  employee_number?: string | null;
  work_email?: string | null;
  directory_status?: string | null;
  party_id?: string | null;
  matched_on?: string | null;
};

export type HrDuplicateScan = {
  ok?: boolean;
  legs_run?: string[];
  legs_skipped?: string[];
  matches: HrDuplicateMatch[];
  party_match?: {
    employee_id: string;
    display_name: string;
    directory_status?: string | null;
    has_terminated_spell?: boolean;
  } | null;
};

const LEG_WORDS: Record<string, string> = {
  name_trgm: "name",
  work_email: "work email",
  personal_email: "personal email",
  ssn_hmac: "Social Security number",
};

function legWords(legs: string[] | undefined): string {
  if (!legs || legs.length === 0) return "";
  return legs.map((leg) => LEG_WORDS[leg] ?? leg).join(", ");
}

export function DuplicatePanel({
  scan,
  org,
  acknowledged,
  onAcknowledge,
}: {
  scan: HrDuplicateScan;
  org: string | null;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const skipped = scan.legs_skipped ?? [];
  const hasMatches = scan.matches.length > 0;

  if (!hasMatches) {
    return (
      <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
        <p className="text-sm text-foreground">
          Nobody here looks like this person.
        </p>
        {skipped.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Checked against {legWords(scan.legs_run)}. Not checked against{" "}
            {legWords(skipped)} — so this is not a complete ruling-out.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            {scan.matches.length === 1
              ? "Somebody here already looks like this person"
              : `${scan.matches.length} people here already look like this person`}
          </h3>
          <p className="text-xs text-foreground">
            Open each one before you continue. A second record for the same person
            cannot be merged back afterwards.
          </p>
          {skipped.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Checked against {legWords(scan.legs_run)}; not checked against{" "}
              {legWords(skipped)}.
            </p>
          ) : null}
        </div>
      </div>

      <ul className="space-y-1.5">
        {scan.matches.map((match) => (
          <li
            key={match.employee_id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <Link
              href={hrEmployeeHref(match.employee_id, null, { org })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              {match.display_name}
            </Link>
            <HrStatusChip status={match.directory_status} />
            {match.employee_number ? (
              <span className="font-mono text-xs text-muted-foreground">
                {match.employee_number}
              </span>
            ) : null}
            {match.work_email ? (
              <span className="text-xs text-muted-foreground">
                {match.work_email}
              </span>
            ) : null}
            {match.matched_on ? (
              <Badge variant="outline" className="ml-auto text-[0.6875rem] font-normal">
                same {LEG_WORDS[match.matched_on] ?? match.matched_on}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {/* THE EXPLICIT TICK. */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Checkbox
          id="hr-not-the-same-person"
          checked={acknowledged}
          onCheckedChange={(value) => onAcknowledge(value === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="hr-not-the-same-person"
          className="cursor-pointer text-sm font-normal leading-snug text-foreground"
        >
          I have looked at {scan.matches.length === 1 ? "that record" : "those records"}{" "}
          and this is a different person.
        </Label>
      </div>
    </section>
  );
}
