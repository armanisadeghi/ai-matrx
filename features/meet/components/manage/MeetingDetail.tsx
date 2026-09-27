"use client";

// features/meet/components/manage/MeetingDetail.tsx
//
// /meetings/[id] — THE MEETING'S HOME before, during and after it (Google
// Calendar's event page + Zoom's meeting page). One-row header: back, title and
// state, the sections, and the actions (Join/Start first). Sections:
//
//   Details      when (the meeting's zone, and the viewer's when it differs),
//                repeat, link, the viewer's own RSVP, agenda
//   Guests       everyone invited with their answer, add / remove / co-host,
//                and "send invitations" to whoever has not been emailed
//   Occurrences  a series' next dates, each movable, cancellable, restorable
//   Settings     waiting room, join before host, AI note-taker, recording —
//                saved as they change, for the host and co-hosts
//   Record       after it ended: the package's own record view
//
// `?at=<original start>` names the occurrence the person came from, so Edit and
// Cancel can ask "this occurrence or the whole series".

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  Copy,
  CopyPlus,
  FileText,
  Link2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCcw,
  Settings2,
  UserPlus,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import {
  meetingLink,
  type MeetingInvitee,
  type MeetingOccurrence,
  type MeetingRecord,
  type RecordingPolicy,
} from "@ai-matrx/meet/react";
import { Skeleton } from "@ai-matrx/design-system";
import {
  EntityModeHeader,
  type EntityHeaderAction,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { meetingOrigin } from "@/features/meet/components/invite/MeetingInviteButton";
import { MeetingGuests } from "@/features/meet/components/manage/MeetingGuests";
import { MeetingRecordWorkspace } from "@/features/meet/components/record/MeetingRecordWorkspace";
import { RsvpControl } from "@/features/meet/components/manage/RsvpControl";
import { MoveOccurrenceDialog } from "@/features/meet/components/manage/MoveOccurrenceDialog";
import { useMeetingActionHost } from "@/features/meet/components/manage/useMeetingActionHost";
import type { OccurrenceRef } from "@/features/meet/components/manage/MeetingFormDialog";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import { RECORDING_POLICY_LABELS } from "@/features/meet/lib/meeting-draft";
import { describeRecurrence } from "@/features/meet/lib/recurrence";
import {
  browserTimeZone,
  formatLongDate,
  formatTimeRange,
  zoneLabel,
} from "@/features/meet/lib/zoned-time";

type Section = "details" | "guests" | "occurrences" | "settings" | "record";

interface Loaded {
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  occurrences: readonly MeetingOccurrence[];
}

function StatusPill({
  meeting,
  live,
}: {
  meeting: MeetingRecord;
  live: boolean;
}) {
  const [label, tone] = meeting.deletedAt
    ? ["Archived", "bg-muted text-muted-foreground"]
    : meeting.cancelledAt
      ? ["Cancelled", "bg-destructive/10 text-destructive"]
      : live
        ? ["Live", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"]
        : meeting.endedAt !== null && !meeting.recurrenceRule
          ? ["Ended", "bg-muted text-muted-foreground"]
          : [null, ""];
  if (label === null) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function MeetingDetail({
  meetingId,
  at,
  section: requested,
}: {
  meetingId: string;
  at: string | null;
  section: string | null;
}) {
  const router = useRouter();
  const actions = useMeetingActions();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [moving, setMoving] = useState<OccurrenceRef | null>(null);
  const [, startTransition] = useTransition();
  const [viewerZone] = useState(browserTimeZone);
  const reload = () => setNonce((n) => n + 1);
  const { run, dialogs } = useMeetingActionHost({ onChanged: reload });
  const repository = actions.repository;
  const isMobile = useIsMobile();

  useEffect(() => {
    if (repository === null) return undefined;
    let live = true;
    const load = async () => {
      const meeting = await repository.meeting(
        meetingId as MeetingRecord["id"],
      );
      const [invitees, occurrences] = await Promise.all([
        repository
          .invitees(meeting.id)
          .catch(() => [] as readonly MeetingInvitee[]),
        meeting.scheduledFor
          ? repository.meetingOccurrences(meeting.id, {
              from: new Date(Date.now() - 24 * 3_600_000).toISOString(),
              to: new Date(Date.now() + 400 * 86_400_000).toISOString(),
              limit: meeting.recurrenceRule ? 20 : 1,
            })
          : Promise.resolve([] as readonly MeetingOccurrence[]),
      ]);
      return { meeting, invitees, occurrences };
    };
    load()
      .then((next) => {
        if (!live) return;
        setLoaded(next);
        setFailure(null);
      })
      .catch((thrown: unknown) => {
        if (live) setFailure(errorSentence(thrown));
      });
    return () => {
      live = false;
    };
  }, [repository, meetingId, nonce]);

  useEffect(() => {
    if (loaded) document.title = `${loaded.meeting.title} — Meetings`;
  }, [loaded]);

  if (failure !== null && loaded === null) {
    return (
      <>
        <EntityModeHeader backHref="/meetings" entityLabel="Meeting" />
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <div
            role="alert"
            className="mx-auto mt-10 max-w-md rounded-md border border-border p-4 text-sm"
          >
            <p className="font-medium">This meeting could not be opened.</p>
            <p className="mt-1 text-muted-foreground">{failure}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={reload}
            >
              Try again
            </Button>
          </div>
        </div>
      </>
    );
  }
  if (loaded === null) {
    return (
      <>
        <EntityModeHeader backHref="/meetings" entityLabel="Meeting" />
        <div
          className="mx-auto max-w-3xl space-y-3 px-4 pt-[calc(var(--shell-header-h)+1rem)]"
          aria-busy="true"
          aria-label="Loading the meeting"
        >
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  const { meeting, invitees, occurrences } = loaded;
  const userId = actions.userId;
  const mine = invitees.find((i) => i.userId === userId) ?? null;
  const isHost = meeting.hostUserId === userId;
  const canManage = isHost || mine?.role === "cohost";
  const zone = meeting.timeZone ?? viewerZone;
  const link = meetingLink(meetingOrigin(), meeting.slug);
  const series = !!meeting.recurrenceRule;
  const ended = meeting.endedAt !== null && !series;
  const inactive = !!meeting.cancelledAt || !!meeting.deletedAt;
  const live =
    !inactive && meeting.startedAt !== null && meeting.endedAt === null;

  const focus: OccurrenceRef | null = (() => {
    if (!series || at === null) return null;
    const hit = occurrences.find(
      (o) => new Date(o.originalStart).getTime() === new Date(at).getTime(),
    );
    return hit
      ? {
          originalStart: hit.originalStart,
          occurrenceStart: hit.occurrenceStart,
          durationMinutes: hit.durationMinutes,
        }
      : null;
  })();
  const next =
    focus ??
    (() => {
      const upcoming = occurrences.find((o) => o.state !== "cancelled");
      return upcoming
        ? {
            originalStart: upcoming.originalStart,
            occurrenceStart: upcoming.occurrenceStart,
            durationMinutes: upcoming.durationMinutes,
          }
        : null;
    })();

  const sections: { key: Section; name: string; icon: typeof FileText }[] = [
    { key: "details", name: "Details", icon: FileText },
    {
      key: "guests",
      name: `Guests${invitees.length ? ` (${invitees.length})` : ""}`,
      icon: Users,
    },
    ...(series
      ? [{ key: "occurrences" as const, name: "Occurrences", icon: ListChecks }]
      : []),
    ...(canManage && !inactive
      ? [{ key: "settings" as const, name: "Settings", icon: Settings2 }]
      : []),
    ...(meeting.endedAt !== null || meeting.startedAt !== null
      ? [{ key: "record" as const, name: "Record", icon: FileText }]
      : []),
  ];
  const section: Section = sections.some((s) => s.key === requested)
    ? (requested as Section)
    : ended
      ? "record"
      : "details";
  const hrefFor = (key: Section) =>
    `/meetings/${meeting.id}?tab=${key}${at ? `&at=${encodeURIComponent(at)}` : ""}`;

  // One-row header: the everyday actions are tap targets, the rest live in "…"
  // on desktop; on a phone everything is in the header's one drawer.
  const primaryActions: EntityHeaderAction[] = [];
  const moreActions: EntityHeaderAction[] = [];
  if (!inactive) {
    primaryActions.push({
      label: "Copy link",
      icon: Copy,
      onPress: () => void run("copy", meeting),
    });
    if (canManage && !ended)
      primaryActions.push({
        label: "Invite",
        icon: UserPlus,
        onPress: () => void run("invite", meeting),
      });
    if (canManage && !ended)
      primaryActions.push({
        label: "Edit",
        icon: Pencil,
        onPress: () => void run("edit", meeting, focus, invitees),
      });
    if (canManage && !ended)
      moreActions.push({
        label: "Reschedule",
        icon: CalendarClock,
        onPress: () => void run("reschedule", meeting, focus, invitees),
      });
  }
  if (canManage)
    moreActions.push({
      label: "Duplicate",
      icon: CopyPlus,
      onPress: () => void run("duplicate", meeting, null, invitees),
    });
  if (!inactive && canManage && !ended)
    moreActions.push({
      label: focus ? "Cancel…" : "Cancel meeting",
      icon: XCircle,
      onPress: () => void run("cancel", meeting, focus, invitees),
    });
  if (!meeting.deletedAt && canManage)
    moreActions.push({
      label: "Archive",
      icon: Archive,
      onPress: () => void run("archive", meeting, null, invitees),
    });
  if (meeting.deletedAt && canManage)
    primaryActions.push({
      label: "Restore",
      icon: ArchiveRestore,
      onPress: () => void run("restore", meeting),
      showLabel: true,
    });
  if (!inactive) {
    primaryActions.push({
      label: ended
        ? "Open record"
        : isHost
          ? live
            ? "Rejoin"
            : "Start"
          : "Join",
      icon: Video,
      primary: true,
      onPress: () => void run("join", meeting),
    });
  }
  const headerActions = isMobile
    ? [...moreActions, ...primaryActions]
    : primaryActions;
  const moreMenu =
    !isMobile && moreActions.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {moreActions.map((a) => (
            <DropdownMenuItem
              key={a.label}
              onSelect={() => a.onPress?.()}
              className={
                a.icon === XCircle
                  ? "text-destructive focus:text-destructive"
                  : undefined
              }
            >
              <a.icon className="h-4 w-4" aria-hidden="true" /> {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      <EntityModeHeader
        backHref="/meetings"
        entityLabel={meeting.title}
        entityStatus={<StatusPill meeting={meeting} live={live} />}
        modes={sections.map((s) => ({
          name: s.name,
          href: hrefFor(s.key),
          icon: s.icon,
        }))}
        activeModeHref={hrefFor(section)}
        actions={headerActions}
        right={moreMenu}
      />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div
          className={cn(
            "mx-auto px-4 pb-12 pt-4",
            section === "record" ? "max-w-6xl" : "max-w-3xl",
          )}
        >
          {section === "details" ? (
            <DetailsSection
              meeting={meeting}
              zone={zone}
              viewerZone={viewerZone}
              next={next}
              focus={focus !== null}
              link={link}
              mine={mine}
              onCopy={() => void run("copy", meeting)}
            />
          ) : null}

          {section === "guests" ? (
            <MeetingGuests
              meeting={meeting}
              invitees={invitees}
              canManage={canManage && !inactive}
              onChanged={reload}
            />
          ) : null}

          {section === "occurrences" ? (
            <OccurrencesSection
              meeting={meeting}
              occurrences={occurrences}
              zone={zone}
              canManage={canManage && !inactive}
              focus={focus}
              onMove={setMoving}
              onCancel={(o) => void run("cancel", meeting, o, invitees)}
              onRestore={async (o) => {
                try {
                  await actions.setOccurrence({
                    meetingId: meeting.id,
                    originalStart: o.originalStart,
                    action: "restore",
                  });
                  toast.success("Back on the schedule.");
                  if (invitees.length > 0)
                    await actions.announce(meeting.id, true);
                  reload();
                } catch (thrown) {
                  toast.error(errorSentence(thrown));
                }
              }}
              onOpen={(o) =>
                startTransition(() =>
                  router.push(
                    `/meetings/${meeting.id}?tab=details&at=${encodeURIComponent(o.originalStart)}`,
                  ),
                )
              }
            />
          ) : null}

          {section === "settings" ? (
            <SettingsSection
              meeting={meeting}
              onSaved={(m) => setLoaded({ ...loaded, meeting: m })}
            />
          ) : null}

          {section === "record" ? (
            <MeetingRecordWorkspace meeting={meeting} canManage={canManage} />
          ) : null}
        </div>
      </div>

      {moving ? (
        <MoveOccurrenceDialog
          open
          onOpenChange={(v) => (!v ? setMoving(null) : undefined)}
          meeting={meeting}
          occurrence={moving}
          hasGuests={invitees.length > 0}
          onDone={reload}
        />
      ) : null}
      {dialogs}
    </>
  );
}

function Field({
  icon: Icon,
  children,
}: {
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function DetailsSection({
  meeting,
  zone,
  viewerZone,
  next,
  focus,
  link,
  mine,
  onCopy,
}: {
  meeting: MeetingRecord;
  zone: string;
  viewerZone: string;
  next: OccurrenceRef | null;
  focus: boolean;
  link: string;
  mine: MeetingInvitee | null;
  onCopy: () => void;
}) {
  const start = next?.occurrenceStart ?? meeting.scheduledFor;
  const duration = next?.durationMinutes ?? meeting.scheduledDurationMinutes;
  return (
    <div className="space-y-5">
      {meeting.cancelledAt ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          This meeting was cancelled
          {meeting.cancellationReason
            ? `: “${meeting.cancellationReason}”`
            : "."}{" "}
          Nobody can join it.
        </div>
      ) : null}
      <h1 className="text-xl font-semibold">{meeting.title}</h1>
      <Field icon={CalendarClock}>
        {start ? (
          <>
            <div>
              {meeting.recurrenceRule ? (
                <span className="text-muted-foreground">
                  {focus ? "This occurrence: " : "Next: "}
                </span>
              ) : null}
              {formatLongDate(start, zone)}
            </div>
            <div className="text-muted-foreground">
              {formatTimeRange(start, duration, zone)} ·{" "}
              {zoneLabel(zone, start)}
            </div>
            {viewerZone !== zone ? (
              <div className="text-xs text-muted-foreground">
                Your time: {formatLongDate(start, viewerZone)},{" "}
                {formatTimeRange(start, duration, viewerZone)}
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">
            No time set — it starts whenever the host opens it.
          </span>
        )}
      </Field>
      {meeting.recurrenceRule ? (
        <Field icon={Repeat}>
          {describeRecurrence(meeting.recurrenceRule)}
        </Field>
      ) : null}
      <Field icon={Link2}>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={link}
            className="truncate font-mono text-sm text-primary hover:underline"
          >
            {link.replace(/^https?:\/\//, "")}
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={onCopy}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {meeting.lobbyEnabled
            ? "Anyone with the link can ask to join; invited people come straight in."
            : "Anyone with the link can join."}
          {meeting.recurrenceRule
            ? " The same link works for every occurrence."
            : ""}
        </div>
      </Field>
      {mine &&
      !meeting.cancelledAt &&
      !meeting.deletedAt &&
      meeting.endedAt === null ? (
        <Field icon={Check}>
          <RsvpControl
            meetingId={meeting.id}
            value={mine.rsvpState === "needs_action" ? null : mine.rsvpState}
          />
        </Field>
      ) : null}
      <Field icon={FileText}>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agenda
        </div>
        {meeting.agenda ? (
          <p className="mt-1 whitespace-pre-wrap">{meeting.agenda}</p>
        ) : (
          <p className="mt-1 text-muted-foreground">No agenda yet.</p>
        )}
      </Field>
    </div>
  );
}

function OccurrencesSection({
  meeting,
  occurrences,
  zone,
  canManage,
  focus,
  onMove,
  onCancel,
  onRestore,
  onOpen,
}: {
  meeting: MeetingRecord;
  occurrences: readonly MeetingOccurrence[];
  zone: string;
  canManage: boolean;
  focus: OccurrenceRef | null;
  onMove: (o: OccurrenceRef) => void;
  onCancel: (o: OccurrenceRef) => void;
  onRestore: (o: OccurrenceRef) => void;
  onOpen: (o: OccurrenceRef) => void;
}) {
  if (occurrences.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming occurrences — the series has ended.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {describeRecurrence(meeting.recurrenceRule)} · next {occurrences.length}{" "}
        · times in {zoneLabel(zone)}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {occurrences.map((o) => {
          const ref: OccurrenceRef = {
            originalStart: o.originalStart,
            occurrenceStart: o.occurrenceStart,
            durationMinutes: o.durationMinutes,
          };
          const focused =
            focus !== null && focus.originalStart === o.originalStart;
          return (
            <li
              key={o.originalStart}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                focused && "bg-primary/5",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(ref)}
              >
                <div
                  className={cn(
                    "text-sm",
                    o.state === "cancelled" &&
                      "text-muted-foreground line-through",
                  )}
                >
                  {formatLongDate(o.occurrenceStart, zone)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatTimeRange(o.occurrenceStart, o.durationMinutes, zone)}
                  {o.state === "moved" ? (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      Moved from {formatLongDate(o.originalStart, zone)}
                    </span>
                  ) : null}
                  {o.state === "cancelled" ? (
                    <span className="ml-2 text-destructive">Cancelled</span>
                  ) : null}
                </div>
              </button>
              {canManage ? (
                o.state === "scheduled" ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => onMove(ref)}
                    >
                      Move
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => onCancel(ref)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => onRestore(ref)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {o.state === "moved" ? "Undo move" : "Restore"}
                  </Button>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function SettingsSection({
  meeting,
  onSaved,
}: {
  meeting: MeetingRecord;
  onSaved: (meeting: MeetingRecord) => void;
}) {
  const actions = useMeetingActions();
  const [saving, setSaving] = useState<string | null>(null);
  const save = async (
    key: string,
    changes: Parameters<typeof actions.update>[1],
  ) => {
    setSaving(key);
    try {
      const updated = await actions.update(meeting, changes);
      onSaved(updated);
      toast.success("Saved.");
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setSaving(null);
    }
  };
  const disabled = saving !== null;
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
      <SettingsRow
        label="Waiting room"
        hint="People without an invitation wait until you or a co-host let them in."
      >
        <Switch
          checked={meeting.lobbyEnabled}
          disabled={disabled}
          onCheckedChange={(v) => void save("lobby", { lobbyEnabled: v })}
          aria-label="Waiting room"
        />
      </SettingsRow>
      <SettingsRow
        label="Join before host"
        hint="Invited people can come in and start before you arrive."
      >
        <Switch
          checked={meeting.joinBeforeHost ?? true}
          disabled={disabled}
          onCheckedChange={(v) => void save("jbh", { joinBeforeHost: v })}
          aria-label="Join before host"
        />
      </SettingsRow>
      <SettingsRow
        label="AI note-taker"
        hint="Live notes and answers during the meeting, a summary and action items after."
      >
        <Switch
          checked={meeting.aiEnabled}
          disabled={disabled}
          onCheckedChange={(v) => void save("ai", { aiEnabled: v })}
          aria-label="AI note-taker"
        />
      </SettingsRow>
      <SettingsRow
        label="Recording"
        hint="Everyone in the meeting is told when a recording starts."
      >
        <Select
          value={meeting.recordingPolicy}
          disabled={disabled}
          onValueChange={(v) =>
            void save("rec", { recordingPolicy: v as RecordingPolicy })
          }
        >
          <SelectTrigger className="h-8 w-48" aria-label="Recording">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RECORDING_POLICY_LABELS) as RecordingPolicy[]).map(
              (p) => (
                <SelectItem key={p} value={p}>
                  {RECORDING_POLICY_LABELS[p]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </SettingsRow>
    </div>
  );
}
