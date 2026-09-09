"use client";

// features/meet/components/MeetingsWorkspace.tsx
//
// CREATE A MEETING, GET ITS LINK. That is the whole surface, and every part of
// it is the package's: `<ScheduleMeeting>` writes through
// `communication.meet_get_or_create_meeting` (the auth-checked RPC, which
// carries the explicit `organization_id` every write in this platform must) and
// renders the durable `/meet/<slug>` link it gets back.
//
// 🚨 NOTHING HERE IS DEAD OR DISABLED-LOOKING. Until an organization is active
// the form is ABSENT and the reason is on screen with what to do about it —
// because a meeting is minted for exactly one organization, and a "Create"
// button that will refuse is worse than no button.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MeetingList, ScheduleMeeting, useMeetHost } from "@ai-matrx/meet/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";

export function MeetingsWorkspace() {
  const router = useRouter();
  const host = useMeetHost();
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const organizationId = useAppSelector(selectActiveOrganizationId);

  // `meetingLink` (the package's ONE link shape) is built from this origin, so
  // the link a person copies is the link they are looking at.
  const appBaseUrl = useMemo(
    () =>
      typeof window === "undefined" ? "" : window.location.origin,
    [],
  );

  if (organizationId === null || host === null) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h2 className="text-base font-semibold">
          Choose an organization to create a meeting
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A meeting belongs to exactly one organization — that is what decides
          who may host it, who is admitted without knocking, and where its
          recording and notes live. Pick your organization from the account menu
          and this form appears.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h2 className="text-base font-semibold">New meeting</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The link is durable: it works before, during and after the meeting, and
          a recurring meeting keeps the same one. Anyone with it can join — a
          guest types a name and waits in the lobby until you let them in.
        </p>
      </div>

      <ScheduleMeeting
        appBaseUrl={appBaseUrl}
        onScheduled={(slug) => {
          setCreatedSlug(slug);
          router.prefetch(`/meet/${slug}`);
        }}
      />

      {createdSlug !== null ? (
        <Link
          href={`/meet/${createdSlug}`}
          className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Open the meeting
        </Link>
      ) : null}

      {/* EVERY MEETING, INCLUDING THE FINISHED ONES (MRI-D2). A finished
          meeting is its summary, its decisions, its action items and its
          transcript behind the same durable link — and until this list existed
          there was no way into any of that from the product. The list is the
          package's, so every consumer inherits it. */}
      <div>
        <h2 className="text-base font-semibold">Your meetings</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          An ended meeting opens its record: what was decided, who owns what,
          and everything that was said.
        </p>
        <MeetingList baseUrl={appBaseUrl} />
      </div>
    </div>
  );
}
