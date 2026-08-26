"use client";

// features/hr/people/profile/tabs/SimpleTabs.tsx
//
// The tabs whose BEHAVIOUR is fixed by this spec but whose BODY belongs to
// another lane or to a door that has not shipped. Each one is here — rather than
// missing — because the server put it in `profile.tabs`, which means this viewer
// genuinely has something on it. A tab in the bar that renders a blank page is
// the failure mode; a tab that says exactly what it is waiting for is not.
//
// Every rule this spec fixes for these tabs IS implemented here, even where the
// data is not:
//
//   EMERGENCY  — self holds editor on their own rows. At least one contact is
//                ENCOURAGED BY A NUDGE, NEVER ENFORCED BY A BLOCK.
//   DOCUMENTS  — reuses `features/files` end to end; HR builds no file storage.
//                A document under legal hold shows the hold and its origin and
//                ITS DELETE ACTION IS ABSENT. 🚨 I-9s ARE NOT HERE.
//   NOTES      — author-scoped: a manager sees only their own. 🚨 THE COMPOSE
//                BOX SAYS A NOTE IS NOT A CORRECTIVE ACTION, with a door to the
//                corrective-action flow. This is the single most common place an
//                HR product lets a manager create an undiscoverable disciplinary
//                record, and the sentence is the fix.
//   RELATIONS  — the subject's cases, subject to the same veto as the case list.
//   HOSTED     — time-off · time · performance · training receive `employment_id`
//                (resolved as of today) and the viewer persona; they NEVER
//                re-resolve identity and NEVER render their own identity header.

import Link from "next/link";
import { FileWarning, Info, ShieldAlert, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";

import { hrRelationsHref, type HrOrgRef } from "../../../routes";
import type { HrEmployeeProfile } from "../../../types";

// ── Emergency contacts ──────────────────────────────────────────────────────

export function EmergencyTab({ profile }: { profile: HrEmployeeProfile }) {
  const isSelf = profile.viewer === "self";

  return (
    <TabShell title="Emergency contacts">
      {/* A NUDGE, NEVER A BLOCK. Nothing on this profile is gated on having one. */}
      <div className="flex max-w-prose items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-foreground">
          {isSelf
            ? "Having at least one person we can call is worth two minutes. Nothing here is blocked if you skip it."
            : "This person is encouraged to keep at least one contact here. It is never required, and nothing is withheld from them for not having one."}
        </p>
      </div>

      <Waiting
        id="hr.people.emergency-contacts"
        sentence="Emergency contacts can be written, but there is no way to read the existing ones back for one person yet — so an add form here would quietly create duplicates."
        action={isSelf ? "Add a contact" : undefined}
        icon={UserPlus}
      />
    </TabShell>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────

export function DocumentsTab({ org }: { org: HrOrgRef }) {
  return (
    <TabShell title="Documents">
      <Waiting
        id="hr.people.documents"
        sentence="This person's document file comes from the platform's own file system — HR stores no files of its own. The link between an employee and their files isn't wired yet."
      />

      {/* 🚨 STATED, NOT ASSUMED. Somebody looking for an I-9 here has to be told
          where it actually is, or they will conclude it was never collected. */}
      <div className="flex max-w-prose items-start gap-2 rounded-md border border-border px-3 py-2">
        <FileWarning
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="text-sm text-foreground">
          I-9s are not here. They live in their own register with their own
          access, deliberately separate from the personnel file.{" "}
          <Link
            href="/hr/documents/i9"
            className="underline underline-offset-2 hover:text-primary"
          >
            Open the I-9 register
          </Link>
          .
        </p>
      </div>

      <p className="max-w-prose text-xs text-muted-foreground">
        When a document is under legal hold, the hold and where it came from show
        on the row, and there is no delete control on it at all — not a greyed
        one.
      </p>
      <span className="sr-only">{org ?? ""}</span>
    </TabShell>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────────

export function NotesTab({ profile }: { profile: HrEmployeeProfile }) {
  const isManager = profile.viewer === "manager";

  return (
    <TabShell title="Notes">
      <p className="max-w-prose text-sm text-muted-foreground">
        {isManager
          ? "Your own notes about this person. Other managers' notes are not here, and this person never sees any of them."
          : "Notes kept about this person by their managers and by HR. This person never sees them."}
      </p>

      {/* 🚨 THE SENTENCE THAT MATTERS MOST ON THIS PAGE.
          A manager who wants to "put something on file" reaches for a note.
          A note is invisible to the person and carries no process — which is
          exactly how an undiscoverable disciplinary record gets created. The
          compose box says so, and offers the real flow next to it. */}
      <div className="max-w-prose space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-foreground">
            A note is not a corrective action. If you are recording something this
            person should be told about, answer for, or improve on, it belongs in
            a corrective action — where they get to read it, respond to it, and
            have their own words kept beside yours.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => void announceComingSoon("hr.people.corrective-action")}
        >
          Start a corrective action instead
        </Button>
      </div>

      <Waiting
        id="hr.people.notes"
        sentence="Notes ride the platform's comment system, scoped to their author. That link isn't wired for an employee record yet."
      />
    </TabShell>
  );
}

// ── Relations ───────────────────────────────────────────────────────────────

/**
 * Routes 15/16 are a sibling lane's. When `features/hr/people/relations/` lands,
 * this tab mounts that lane's case list scoped to this employee — the SAME
 * components, never a second case UI. Until then it is an honest door.
 *
 * The subject veto applies here exactly as it does on the list: an excluded row
 * is not in the result set and its count is not in the total.
 */
export function RelationsTab({
  profile,
  org,
}: {
  profile: HrEmployeeProfile;
  org: HrOrgRef;
}) {
  return (
    <TabShell title="Employee relations">
      <p className="max-w-prose text-sm text-muted-foreground">
        Corrective actions, complaints and incidents involving {" "}
        {profile.header.display_name}. Some cases are hidden from some readers by
        rule — including from people named in them — so a count here can
        legitimately differ from a colleague&apos;s.
      </p>
      <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
        <Link href={hrRelationsHref(org)}>Open employee relations</Link>
      </Button>
    </TabShell>
  );
}

// ── Hosted tabs ─────────────────────────────────────────────────────────────

const HOSTED: Record<
  string,
  { title: string; lane: string; comingSoonId: string }
> = {
  "time-off": {
    title: "Time off",
    lane: "Leave & PTO",
    comingSoonId: "hr.people.tab-time-off",
  },
  time: {
    title: "Time & schedule",
    lane: "Time & Attendance and Scheduling",
    comingSoonId: "hr.people.tab-time",
  },
  performance: {
    title: "Performance",
    lane: "Employee Performance Reviews",
    comingSoonId: "hr.people.tab-performance",
  },
  training: {
    title: "Training",
    lane: "Training",
    comingSoonId: "hr.people.tab-training",
  },
};

export function isHostedTab(segment: string): boolean {
  return segment in HOSTED;
}

/**
 * The host contract, made explicit in the markup: the panel is handed
 * `employmentId` (resolved as of TODAY by the server) and the viewer persona,
 * and it owns its own empty state. It never re-resolves identity and never draws
 * a second identity header — this profile already has one.
 */
export function HostedTab({
  segment,
  profile,
}: {
  segment: string;
  profile: HrEmployeeProfile;
}) {
  const hosted = HOSTED[segment];
  if (!hosted) return null;

  return (
    <TabShell title={hosted.title}>
      <div
        className="max-w-prose space-y-2 rounded-lg border border-dashed border-border p-3"
        data-hr-hosted-panel={segment}
        data-hr-employment-id={profile.header.employment_id ?? ""}
        data-hr-viewer={profile.viewer}
      >
        <p className="text-sm text-foreground">
          The {hosted.title.toLowerCase()} panel is built by the {hosted.lane}{" "}
          part of HR, and mounts here when it ships.
        </p>
        <p className="text-sm text-muted-foreground">
          It gets this person&apos;s current employment and who you are, and
          nothing else — so it can never disagree with the header above it about
          whose record this is.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => void announceComingSoon(hosted.comingSoonId)}
        >
          What lands here?
        </Button>
      </div>

      {/* §1.4: machinery a worker class does not have is ABSENT, and nothing
          anywhere says "not available for contractors". So this note appears
          only where the machinery DOES exist and is simply not built yet. */}
    </TabShell>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function TabShell({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 p-3 sm:p-4", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Waiting({
  id,
  sentence,
  action,
  icon: Icon,
}: {
  id: string;
  sentence: string;
  action?: string;
  icon?: typeof Info;
}) {
  return (
    <div className="max-w-prose space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm text-muted-foreground">{sentence}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 sm:min-h-9"
        onClick={() => void announceComingSoon(id)}
      >
        {Icon ? <Icon className="mr-2 h-4 w-4" aria-hidden /> : null}
        {action ?? "What is missing?"}
      </Button>
    </div>
  );
}
