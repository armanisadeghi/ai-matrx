"use client";

// features/mandates/workspace/MandateProvenancePanel.tsx
//
// PROVENANCE & USAGE, on the Mandate's own page, at every rung.
//
// 🚨 THE DEFECT THIS CLOSES (2026-09-11). Three Mandates wore "Holder missing"
// — `shortcut.full_prompt_optimizer`, `shortcut.simple_system_message_generator`
// and `patrol.purpose_canary_20260829225707` — and the page could say only THAT
// they were broken, never where they came from, whether anyone is offered them,
// or whether anything had ever run them. The owner's words:
//
//   "I don't want to fix these until something tells me inside of the system
//    exactly what random unknown mandates like this are from and where they're
//    used… in the long term, it ensures that we have proper systems in place
//    for managing mandates both at the system admin level and also at the user
//    level and at the organization level."
//
// So: four rows, in the surface's own density (`PropertyRow`), on the Definition
// tab, on EVERY host — `/mandates/[key]`, `/administration/mandates/[key]` and
// `/organizations/[orgId]/settings/mandates/[key]` all render the one
// `MandateWorkspace`, so admin-only was never an option and is not one here.
//
// 🚨 EVERY SENTENCE IS THE SERVER'S, VERBATIM. One report
// (`aidream/services/mandates/provenance.py`), printed. This file decides
// LAYOUT and nothing else — the one exception is `runsReading`, which lives in
// ../provenance.ts as a value and is pinned by this folder's test, because
// "never ran" and "could not be counted" must never render the same.
//
// 🚨 AND IT NEVER GOES QUIET ON FAILURE. A panel that disappears when the
// report errors reads as "nothing to see here", which is the same lie as a
// dead control. The error is said out loud, verbatim.

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PropertyRow } from "@/components/official/ConfigurationFields";
import { Section } from "./Section";
import {
  ORIGIN_LABELS,
  PROVENANCE_SECTION_TITLE,
  runsReading,
  useMandateProvenance,
  type MandateProvenanceReport,
} from "@/features/mandates/provenance";

/** A link that opens a surface, in the panel's own small type. */
function SurfaceLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden="true" />
    </Link>
  );
}

export function MandateProvenancePanel({
  mandateKey,
}: {
  mandateKey: string;
}) {
  const { report, loading, error } = useMandateProvenance(mandateKey);

  if (loading && !report && !error) {
    return (
      <Section title={PROVENANCE_SECTION_TITLE}>
        <div className="rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
          Reading where this Mandate came from…
        </div>
      </Section>
    );
  }

  if (error || !report) {
    return (
      <Section title={PROVENANCE_SECTION_TITLE}>
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-3 py-3"
        >
          <p className="text-sm font-semibold text-foreground">
            Where this Mandate came from, and whether anything runs it, is
            unknown — not clean.
          </p>
          <p className="mt-0.5 break-words text-[12.5px] text-muted-foreground">
            {error ?? "The server returned no provenance report."}
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title={PROVENANCE_SECTION_TITLE}
      hint="Read from the source record, input definitions, and run history"
    >
      <div className="rounded-lg border border-border bg-card px-3">
        <OriginRow report={report} />
        <OfferedRow report={report} />
        <RunsRow report={report} />
        <HeldByRow report={report} />
      </div>
    </Section>
  );
}

function OriginRow({ report }: { report: MandateProvenanceReport }) {
  const { origin } = report;
  return (
    <PropertyRow
      label="Origin"
      value={
        <span className="space-y-0.5">
          <span className="block font-medium text-foreground">
            {ORIGIN_LABELS[origin.kind]}
            {origin.created_at ? ` · ${origin.created_at.slice(0, 10)}` : ""}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {origin.sentence}
          </span>
        </span>
      }
      source={origin.organization_name ?? undefined}
    />
  );
}

function OfferedRow({ report }: { report: MandateProvenanceReport }) {
  const offers = report.offered_on;
  return (
    <PropertyRow
      label="Offered on"
      value={
        <span className="space-y-0.5">
          {offers.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {offers.map((offer) => (
                <SurfaceLink key={offer.href} href={offer.href}>
                  {offer.surface}
                </SurfaceLink>
              ))}
            </span>
          ) : (
            <span className="block font-medium text-foreground">Nowhere</span>
          )}
          <span className="block text-[12.5px] text-muted-foreground">
            {report.offered_sentence}
          </span>
        </span>
      }
    />
  );
}

function RunsRow({ report }: { report: MandateProvenanceReport }) {
  const reading = runsReading(report.usage);
  const showLink = reading.kind === "ran";
  return (
    <PropertyRow
      label="Runs"
      value={
        <span className="space-y-0.5">
          <span
            className="block font-medium text-foreground"
            data-runs-reading={reading.kind}
          >
            {reading.text}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {report.usage.sentence}
          </span>
          {/* A link to an EMPTY list is a dead control. It appears only when
              there is something behind it. */}
          {showLink ? (
            <SurfaceLink href={report.usage.runs_href}>
              See these runs
            </SurfaceLink>
          ) : null}
        </span>
      }
      state={
        report.usage.code_reference_count > 0
          ? `${report.usage.code_reference_count} code call sites recorded`
          : undefined
      }
    />
  );
}

function HeldByRow({ report }: { report: MandateProvenanceReport }) {
  const holders = report.held_by;
  return (
    <PropertyRow
      label="Held by"
      value={
        <span className="space-y-0.5">
          <span className="block font-medium text-foreground">
            {holders.length === 0
              ? "No rung"
              : holders
                  .map(
                    (holder) =>
                      `${RUNG_WORDS[holder.rung]}: ${holder.holder_name ?? "nobody"}`,
                  )
                  .join(" · ")}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {report.held_sentence}
          </span>
        </span>
      }
    />
  );
}

/** The platform's own words for the three rungs. Never coined here. */
const RUNG_WORDS: Record<"system" | "organization" | "user", string> = {
  system: "System",
  organization: "Organization",
  user: "Personal",
};
