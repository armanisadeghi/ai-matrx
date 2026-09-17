"use client";

/**
 * PartyPeek — "wait, which Dana is that?" for a Person (or company) in the CRM.
 *
 * 🚨 F-40. The `party` token had no peek at all, so every surface that names a
 * Person — the approvals queue's contact-import card first among them — could
 * only send the reader to `/crm/<id>`, out of whatever they were doing. The
 * generic `RegistryPeek` would have answered with the name, `visibility` and two
 * dates: nothing that tells two same-named People apart. The question a reader
 * actually asks is *which* person, and the answer is the job title, the employer
 * and the contact values, which is why this kind earns a bespoke peek (see the
 * rule in `components/official/entity-ref/doors.ts`).
 *
 * It is NOT a second Person renderer: the read is the canonical
 * `fetchPartyDetail` (the same bundle the record page loads, org-scoped through
 * RLS on `crm.*`), the contact value and its reachability come from the same
 * helpers the record page's Contact card uses, and the chrome is the shared
 * `PeekDialog`, whose footer resolves the full record's route from the entity
 * registry. The 360° workspace stays at `/crm/<id>`; the in-place window/docked
 * dossier is the Detail primitive (`features/item-presentation/registry.tsx`).
 */

import React from "react";
import { Building2, User } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { fetchPartyDetail } from "@/features/crm/service";
import { describeBlocks, mediumBlocks } from "@/features/crm/reachability";
import type { PartyDetail } from "@/features/crm/types";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

/** The employer line: the current affiliation, else the denormalised employer. */
function employerLine(detail: PartyDetail): string | null {
  const current = detail.affiliations.find((a) => a.is_current) ?? null;
  const name = current?.employer?.display_name ?? detail.party.employer?.display_name ?? null;
  if (!name) return null;
  const role = current?.title?.trim() || detail.party.job_title?.trim() || null;
  return role ? `${role} at ${name}` : name;
}

/** `channel_code` in the person's words. The timeline's icon map is its own. */
function channelWords(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  if (!raw) return "Activity";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PartyPeek({ id, open, onClose }: PeekProps) {
  const [detail, setDetail] = React.useState<PartyDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  // A read that FAILED is not a record that is not there — the gate below says
  // which, and never reports an empty Person for data we could not read.
  // 🚨 The thrown error OBJECT is kept, never flattened to its `.message`:
  // `fetchPartyDetail` throws `RecordUnavailableError` on a zero-row/RLS miss,
  // and only `classifyDataError` (fed the real object) can tell that apart from
  // a transient fault — a bare string always reads as a fault (Bugbot #4042337969).
  const [error, setError] = React.useState<unknown>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPartyDetail(id);
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setError(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const party = detail?.party ?? null;
  const isPerson = party?.party_kind === "person";
  const employer = detail ? employerLine(detail) : null;
  const points = detail?.contactPoints ?? [];
  const lastInteraction = detail?.interactions[0] ?? null;

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={party?.display_name || "Person"}
      icon={
        isPerson ? (
          <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        ) : (
          <Building2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        )
      }
      token="party"
      id={id}
      loading={loading}
    >
      {party ? (
        <>
          <PeekField label={isPerson ? "Person" : "Company"}>
            <span className="text-muted-foreground">
              {employer ??
                party.job_title?.trim() ??
                party.headline?.trim() ??
                party.primary_domain?.trim() ??
                "No title or employer recorded here"}
            </span>
          </PeekField>
          <PeekField label="Contact">
            {points.length > 0 ? (
              <ul className="space-y-1">
                {points.map((point) => {
                  const value = point.medium.display_value ?? point.medium.value_raw;
                  const blocks = describeBlocks(mediumBlocks(point.medium));
                  return (
                    <li key={point.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {point.channel}
                      </span>
                      <span className="break-all">{value}</span>
                      {blocks ? (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                          {blocks}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="italic text-muted-foreground">
                No email, phone or handle is recorded here yet.
              </span>
            )}
          </PeekField>
          {party.do_not_contact && (
            <PeekField label="Do not contact">
              <span className="text-amber-600 dark:text-amber-400">
                {party.do_not_contact_reason?.trim() ||
                  "Marked do-not-contact here — no outreach may be sent."}
              </span>
            </PeekField>
          )}
          <PeekField label="Last activity">
            <span className="text-muted-foreground">
              {lastInteraction
                ? `${channelWords(lastInteraction.channel_code)} · ${new Date(
                    lastInteraction.occurred_at ?? lastInteraction.created_at,
                  ).toLocaleString()}`
                : "Nothing logged with this record yet."}
            </span>
          </PeekField>
        </>
      ) : (
        // Denied / deleted / missing / transient each render their TRUE state.
        <AccessGate token="party" id={id} error={error} />
      )}
    </PeekDialog>
  );
}
