"use client";

// features/organizations/components/RecordOrganizationSwitchOffer.tsx
//
// THE ONE-CLICK "THIS IS IN <ORG> — SWITCH" OFFER, for every page that opens
// ONE record.
//
// THE OWNER'S LAW (Arman, 2026-09-23): "The permission is to the person, not
// the org. ALWAYS... My active org has absolutely no impact on what I can
// see." A record opens because the PERSON may read it — never because of which
// organization happens to be selected. So a record page never gates on the
// selection, and it never silently changes it either: opening a record must
// never move the person's working organization (the retired
// `useAdoptRecordOrganization` did exactly that, with a toast after the fact).
//
// What a record page DOES owe the person is the truth, and the remedy: when the
// record lives in an organization other than the one they are working in (or
// they are working in none), say so in one line and offer the switch — one
// click, their choice. Doing things (writes, runs) still happens in an
// organization, so this is the door to acting on the record in its own home.
//
// Lifted from `app/(core)/d/[renderId]/page.tsx`, which first shipped it.
//
// It renders NOTHING when the record is already in the selected organization,
// when the record names no organization, or when the person is not a member of
// the record's organization (a record shared with them from outside: there is
// nothing to switch to, and the record still opens).

import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useUserOrganizations } from "../hooks";

export interface RecordOrganizationSwitchOfferProps {
  /** The record's OWN organization (its `organization_id`). */
  organizationId: string | null | undefined;
  /**
   * The organization's name, when the record's read already answered it. When
   * omitted, the name comes from the person's memberships.
   */
  organizationName?: string | null;
  /**
   * Whether the person is a member of the record's organization, when the
   * record's read already answered it. When omitted, it is read from the
   * person's memberships; a non-member gets no offer (there is nothing to
   * switch to), and the record still opens.
   */
  isMember?: boolean;
  /** What the record is called in a sentence: "document", "Rulebook", "library". */
  what: string;
  className?: string;
}

export function RecordOrganizationSwitchOffer({
  organizationId,
  organizationName,
  isMember,
  what,
  className,
}: RecordOrganizationSwitchOfferProps) {
  const dispatch = useAppDispatch();
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const { organizations } = useUserOrganizations();

  if (!organizationId || organizationId === selectedOrganizationId) return null;

  const membership = organizations.find((org) => org.id === organizationId);
  const member = isMember ?? Boolean(membership);
  if (!member) return null;

  const name = organizationName ?? membership?.name ?? null;
  // Until the name is known there is nothing honest to say beyond "another
  // organization", and a nameless switch button is worse than a beat of quiet.
  if (!name) return null;

  return (
    <div
      role="status"
      className={
        "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm " +
        (className ?? "")
      }
    >
      <span className="flex min-w-0 items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          This {what} is in <strong>{name}</strong>
          {selectedOrganizationId
            ? ", not the organization you are working in."
            : ". You are not working in an organization right now."}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => dispatch(chooseActiveOrganization({ id: organizationId, name }))}
      >
        Switch to {name}
      </Button>
    </div>
  );
}
