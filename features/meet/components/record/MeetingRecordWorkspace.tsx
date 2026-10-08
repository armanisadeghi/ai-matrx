"use client";

// features/meet/components/record/MeetingRecordWorkspace.tsx
//
// THE MEETING AFTER THE MEETING, ON ITS OWN PAGE (Meet wave 3) — the Record
// tab of /meetings/[id]. Bar: Zoom's recording page (video beside a searchable
// transcript) + Google Meet's notes doc, and more:
//
//   left   recording (plays from any transcript line), summary, decisions,
//          action items that become platform tasks, notes as it happened,
//          ask the meeting, what guests may read
//   right  Transcript (search, click-to-seek, follow-along) | Chat | Activity
//          (polls, Q&A, whiteboard — Meet wave 5) | People
//   top    when · how long · who, Email recap (host), Export
//
// The data is the package's `useMeetingRecord` (the same bundle the public
// `/meet/<slug>` record reads) — this screen arranges it; it never re-derives
// what the meeting decided.
//
// `?t=<transcript line id>` opens at that line, `?note=<note id>` marks that
// decision / action item, `?recap=1` (the host's "recap ready" notification)
// opens the recap for review.

import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Mail,
  MessageSquare,
  ScrollText,
  Users,
} from "lucide-react";
import {
  GuestRecordAccessControl,
  meetingLength,
  meetingLink,
  meetingWhen,
  playableRecordingFileId,
  recordingNotice,
  summarizeMeetingRecordRestrictions,
  uniqueAttendees,
  useMeetHost,
  useMeetingRecord,
  wrapUpStatus,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import { Skeleton, Button as SurfaceButton, } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { retryActiveOrganization } from "@/lib/organizations/retryActiveOrganization";
import { meetingOrigin } from "@/features/meet/components/invite/MeetingInviteButton";
import { ActionItemsSection } from "@/features/meet/components/record/ActionItemsSection";
import { AttendancePanel } from "@/features/meet/components/record/AttendancePanel";
import { ActivityLogPanel } from "@/features/meet/components/record/ActivityLogPanel";
import { ChatLogPanel } from "@/features/meet/components/record/ChatLogPanel";
import { RecapDialog } from "@/features/meet/components/record/RecapDialog";
import { RecordExportMenu } from "@/features/meet/components/record/RecordExportMenu";
import {
  RecordingSeekPlayer,
  type SeekRequest,
} from "@/features/meet/components/record/RecordingSeekPlayer";
import { MeetingOrgScope } from "@/features/meet/components/MeetingOrgScope";
import { TranscriptPanel } from "@/features/meet/components/record/TranscriptPanel";
import { ShareWithAudienceButton } from "@/features/sharing/audience/ShareWithAudience";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { LinkedRecordsSection } from "@/features/scopes/components/linked-records/LinkedRecordsSection";

type Side = "transcript" | "chat" | "activity" | "people";

export function MeetingRecordWorkspace({
  meeting,
  canManage,
}: {
  meeting: MeetingRecord;
  canManage: boolean;
}) {
  // The record is read in the MEETING's own organization, not the active one.
  return (
    <MeetingOrgScope
      organizationId={meeting.organizationId}
      fallback={<ChooseOrganizationNotice />}
    >
      <MeetingRecordWorkspaceInner meeting={meeting} canManage={canManage} />
    </MeetingOrgScope>
  );
}

function ChooseOrganizationNotice() {
  return (
    <div className="mx-auto mt-8 max-w-md rounded-md border border-border p-4 text-sm">
      <p className="font-medium">No organization is available to open this record.</p>
      <p className="mt-1 text-muted-foreground">
        The recording, the chat and the recap are read through an organization
        you belong to. Try again, or create an organization.
      </p>
      <Button
        type="submit"
        variant="outline"
        className="mt-3"
        onClick={() => retryActiveOrganization()}
      >
        Try again
      </Button>
    </div>
  );
}

function MeetingRecordWorkspaceInner({
  meeting,
  canManage,
}: {
  meeting: MeetingRecord;
  canManage: boolean;
}) {
  const host = useMeetHost();
  const params = useSearchParams();
  if (host === null) return <ChooseOrganizationNotice />;
  return (
    <Workspace
      meeting={meeting}
      canManage={canManage}
      focusLineId={params.get("t")}
      focusNoteId={params.get("note")}
      openRecap={params.get("recap") === "1"}
      openShare={params.get("share") === "1"}
      userId={host.identity.userId}
    />
  );
}

function Workspace({
  meeting,
  canManage,
  focusLineId,
  focusNoteId,
  openRecap,
  openShare,
  userId,
}: {
  meeting: MeetingRecord;
  canManage: boolean;
  focusLineId: string | null;
  focusNoteId: string | null;
  openRecap: boolean;
  openShare: boolean;
  userId: string | null;
}) {
  const record = useMeetingRecord(meeting);
  const [side, setSide] = useState<Side>("transcript");
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const [currentMs, setCurrentMs] = useState<number | null>(null);
  const [recapOpen, setRecapOpen] = useState(openRecap && canManage);
  const [question, setQuestion] = useState("");

  if (record.failure !== null) {
    return (
      <div
        role="alert"
        className="mx-auto mt-8 max-w-md rounded-md border border-destructive/40 p-4 text-sm"
      >
        <p className="font-medium">This meeting record could not be opened.</p>
        <p className="mt-1 text-muted-foreground">
          {record.failure.message} {record.failure.remedy}
          <ErrorAlchemyMenu error={record.failure.message} size="xs" />
        </p>
        <Button
          type="submit"
          variant="outline"
          className="mt-3"
          onClick={record.reload}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (record.loading || record.record === null) {
    return (
      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]"
        aria-busy="true"
        aria-label="Opening the meeting record"
      >
        <div className="space-y-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  const bundle = record.record;
  const wrapUp = wrapUpStatus(bundle);
  const fileId = playableRecordingFileId(bundle.recording);
  const notice = recordingNotice(bundle.recording);
  const when = meetingWhen(meeting);
  const length = meetingLength(meeting);
  // People, not joins: a rejoin or a second device is one attendee.
  const attended = uniqueAttendees(
    bundle.attendees.filter((p) => !p.isAgent && p.joinedAt !== null),
    bundle.names,
  ).length;
  const link = meetingLink(meetingOrigin(), meeting.slug);
  const notices = summarizeMeetingRecordRestrictions(bundle.restrictions);
  const seekTo = (ms: number) => setSeek({ ms, nonce: Date.now() });
  const whenShort = meeting.startedAt
    ? new Date(meeting.startedAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : when;

  const sides: { key: Side; label: string; icon: typeof Users }[] = [
    { key: "transcript", label: "Transcript", icon: ScrollText },
    { key: "chat", label: "Chat", icon: MessageSquare },
    { key: "activity", label: "Activity", icon: BarChart3 },
    {
      key: "people",
      label: `People${attended ? ` ${attended}` : ""}`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {whenShort}
          {length ? ` · ${length}` : ""}
          {attended
            ? ` · ${attended} ${attended === 1 ? "person" : "people"}`
            : ""}
        </p>
        {canManage ? (
          <ShareWithAudienceButton
            kind="meeting"
            sourceId={meeting.id}
            label="Share with everyone in the meeting"
            autoOpen={openShare}
          />
        ) : null}
        {canManage ? (
          <Button
            icon={<Mail aria-hidden="true" />}
            type="submit"
            variant="primary"
            onClick={() => setRecapOpen(true)}
          > Email recap
          </Button>
        ) : null}
        <RecordExportMenu
          meeting={meeting}
          bundle={bundle}
          when={when}
          link={link}
          {...(canManage ? { onSendRecap: () => setRecapOpen(true) } : {})}
        />
      </div>

      {notices.map((n) => (
        <div
          key={n.parts.join("-")}
          role="status"
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
        >
          <p>{n.message}</p>
          <p className="text-xs text-muted-foreground">{n.remedy}</p>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {bundle.recording !== null ? (
            <section aria-label="Recording" className="space-y-1">
              {fileId !== null ? (
                <RecordingSeekPlayer
                  fileId={fileId}
                  seek={seek}
                  onTime={setCurrentMs}
                />
              ) : null}
              {notice ? (
                <p className="text-xs text-muted-foreground">{notice}</p>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Summary" className="space-y-1.5">
            <h2 className="text-sm font-semibold">Summary</h2>
            {wrapUp.state === "written" ? (
              <div className="text-sm leading-relaxed"><RichContent source={bundle.summary?.text ?? ""} level="standard" /></div>
            ) : wrapUp.state === "in-progress" ? (
              <div role="status" className="text-sm text-muted-foreground">
                <p>{wrapUp.message}</p>
                <SurfaceButton
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={record.reload}
                >
                  Check again
                </SurfaceButton>
              </div>
            ) : (
              <p
                role={wrapUp.state === "failed" ? "alert" : undefined}
                className="text-sm text-muted-foreground"
              >
                {wrapUp.message}
              </p>
            )}
          </section>

          <section aria-label="Decisions" className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              Decisions
              {bundle.decisions.length ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {bundle.decisions.length}
                </span>
              ) : null}
            </h2>
            {bundle.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {wrapUp.state === "refused"
                  ? wrapUp.message
                  : "Nothing was recorded as a decision in this meeting."}
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {bundle.decisions.map((d) => (
                  <li
                    key={d.id}
                    id={`note-${d.id}`}
                    className={cn(
                      focusNoteId === d.id && "rounded bg-primary/5",
                    )}
                  >
                    {d.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ActionItemsSection
            meeting={meeting}
            bundle={bundle}
            when={whenShort}
            canManage={canManage}
            userId={userId}
            focusNoteId={focusNoteId}
          />

          {bundle.liveNotes.length > 0 ? (
            <details className="group rounded-lg border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-semibold">
                <ChevronRight
                  className="h-4 w-4 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                Notes as it happened
                <span className="font-normal text-muted-foreground">
                  {bundle.liveNotes.length}
                </span>
              </summary>
              <ul className="space-y-1.5 border-t border-border px-3 py-2 text-sm">
                {bundle.liveNotes.map((n) => (
                  <li
                    key={n.id}
                    id={`note-${n.id}`}
                    className={cn(
                      focusNoteId === n.id && "rounded bg-primary/5",
                    )}
                  >
                    {n.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {userId !== null ? (
            <section aria-label="Ask about this meeting" className="space-y-1.5">
              <h2 className="text-sm font-semibold">Ask about this meeting</h2>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) void record.ask(question.trim());
                }}
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What did we promise about pricing?"
                  aria-label="Ask about this meeting"
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm"
                />
                <Button
                  variant="primary"
                  type="submit"
                  disabled={!question.trim() || record.asking}
                >
                  {record.asking ? "Asking…" : "Ask"}
                </Button>
              </form>
              {record.answer ? (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <AnswerValueView text={record.answer} />
                </div>
              ) : null}
              {record.askError ? (
                <p role="alert" className="text-xs text-destructive">
                  {record.askError.message} {record.askError.remedy}
                  <ErrorAlchemyMenu error={record.askError.message} size="xs" />
                </p>
              ) : null}
            </section>
          ) : null}

          <GuestRecordAccessControl meeting={meeting} />
          {/* The organization's own fields on this meeting (lane 7 W5) — on the Record tab an
              ended meeting lands on, in its info column. */}
          <EntityCustomFields entityToken="meet_meeting" recordId={meeting.id} organizationId={meeting.organizationId} />
          {/* Everything linked to this meeting, both ways (W1.4). */}
          <LinkedRecordsSection backLinksShownElsewhere token="meet_meeting" id={meeting.id} title={meeting.title} />
        </div>

        <aside
          aria-label="Transcript, chat and people"
          className="flex h-[70dvh] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-3 lg:h-[calc(100dvh-var(--shell-header-h)-5rem)]"
        >
          <div
            role="tablist"
            className="flex shrink-0 gap-0.5 border-b border-border p-1"
          >
            {sides.map((s) => (
              <button
                key={s.key}
                role="tab"
                type="button"
                aria-selected={side === s.key}
                onClick={() => setSide(s.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium",
                  side === s.key
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {side === "transcript" ? (
              <TranscriptPanel
                bundle={bundle}
                focusId={focusLineId}
                currentMs={currentMs}
                onSeek={seekTo}
              />
            ) : side === "chat" ? (
              <ChatLogPanel meetingId={meeting.id} />
            ) : side === "activity" ? (
              <ActivityLogPanel meetingId={meeting.id} />
            ) : (
              <AttendancePanel meeting={meeting} bundle={bundle} />
            )}
          </div>
        </aside>
      </div>

      {canManage ? (
        <RecapDialog
          meetingId={meeting.id}
          open={recapOpen}
          onOpenChange={setRecapOpen}
        />
      ) : null}
    </div>
  );
}
