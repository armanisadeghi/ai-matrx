"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton, } from "@ai-matrx/design-system";
import { Button as ControlButton, Input, Tile } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { ErrorNotice } from "@ai-matrx/design-system";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import {
  googleMeetReviewService,
  type MeetConferencePreviewPage,
  type MeetReviewService,
  type MeetTranscriptEntriesPreview,
} from "./service";

export interface MeetReviewContext {
  organizationId: string;
  actorId: string;
  connections: GoogleConnectionSummary[];
}

export function eligibleMeetConnections(
  connections: readonly GoogleConnectionSummary[],
  actorId: string,
): GoogleConnectionSummary[] {
  return connections.filter(
    (connection) =>
      connection.owner_type === "user" &&
      connection.owner_user_id === actorId &&
      connection.health === "connected" &&
      connection.scopes.includes(GOOGLE_SCOPE.meetingsSpaceReadonly),
  );
}

type ConferenceSource = Readonly<{
  organizationId: string;
  connectionId: string;
  startTime: string;
  endTime: string;
  meetingCode: string | null;
  pageToken: string | null;
}>;
type TranscriptSource = Readonly<{
  organizationId: string;
  connectionId: string;
  conferenceName: string;
  transcriptName: string;
  pageToken: string | null;
}>;
type Busy = "conferences" | "transcript" | null;

function aware(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Meet preview failed.";
}

/** The canonical presentation: injectable context/service keeps test transport out of production paths. */
export function MeetReviewBody(props: {
  context: MeetReviewContext;
  service?: MeetReviewService;
}) {
  const fingerprint = JSON.stringify(
    props.context.connections.map((connection) => [
      connection.id,
      connection.owner_type,
      connection.owner_user_id,
      connection.organization_id,
      connection.provider,
      connection.provider_subject,
      connection.account_email,
      connection.account_name,
      connection.status,
      connection.health,
      connection.credential_present,
      connection.credential_stable,
      connection.scopes,
    ]),
  );
  return (
    <MeetReviewBodyInner
      key={`${props.context.organizationId}:${props.context.actorId}:${fingerprint}`}
      {...props}
    />
  );
}

function MeetReviewBodyInner({
  context,
  service = googleMeetReviewService,
}: {
  context: MeetReviewContext;
  service?: MeetReviewService;
}) {
  const eligible = eligibleMeetConnections(
    context.connections,
    context.actorId,
  );
  const [connectionId, setConnectionId] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [meetingCode, setMeetingCode] = useState("");
  const [conferencePage, setConferencePage] =
    useState<MeetConferencePreviewPage | null>(null);
  const [conferenceSource, setConferenceSource] =
    useState<ConferenceSource | null>(null);
  const [transcriptPage, setTranscriptPage] =
    useState<MeetTranscriptEntriesPreview | null>(null);
  const [transcriptSource, setTranscriptSource] =
    useState<TranscriptSource | null>(null);
  const [selectedConference, setSelectedConference] = useState<string | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [failedConferenceSource, setFailedConferenceSource] =
    useState<ConferenceSource | null>(null);
  const [failedTranscriptSource, setFailedTranscriptSource] =
    useState<TranscriptSource | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const generation = useRef(0);
  const inflight = useRef<Busy>(null);
  const mounted = useRef(true);
  const conferenceTokens = useRef(new Set<string>());
  const transcriptTokens = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "Meet source reviewer" });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const reset = () => {
    generation.current += 1;
    setConferencePage(null);
    setConferenceSource(null);
    setTranscriptPage(null);
    setTranscriptSource(null);
    setSelectedConference(null);
    setProblem(null);
    setBusy(null);
    inflight.current = null;
    setFailedConferenceSource(null);
    setFailedTranscriptSource(null);
    conferenceTokens.current.clear();
    transcriptTokens.current.clear();
  };
  const invalidate = () => {
    reset();
  };

  const loadConferences = async (
    pageToken: string | null = null,
    frozen: ConferenceSource | null = null,
  ) => {
    if (inflight.current) return;
    if (pageToken && conferenceTokens.current.has(pageToken)) {
      setProblem(
        "This conference page was already shown; the provider repeated its page token.",
      );
      return;
    }
    const startTime = frozen?.startTime ?? aware(startLocal);
    const endTime = frozen?.endTime ?? aware(endLocal);
    if (!connectionId || !startTime || !endTime) {
      setProblem(
        "Choose an account and enter both dates before previewing Meet conferences.",
      );
      return;
    }
    const source: ConferenceSource = Object.freeze(
      frozen
        ? { ...frozen, pageToken }
        : {
            organizationId: context.organizationId,
            connectionId,
            startTime,
            endTime,
            meetingCode: meetingCode === "" ? null : meetingCode,
            pageToken,
          },
    );
    if (!eligible.some((connection) => connection.id === source.connectionId)) {
      setProblem("That Google account is no longer eligible for Meet review.");
      return;
    }
    if (!pageToken) conferenceTokens.current.clear();
    transcriptTokens.current.clear();
    setConferencePage(null);
    setTranscriptPage(null);
    setConferenceSource(null);
    setTranscriptSource(null);
    setSelectedConference(null);
    setFailedConferenceSource(null);
    setFailedTranscriptSource(null);
    const intent = ++generation.current;
    inflight.current = "conferences";
    setBusy("conferences");
    setProblem(null);
    try {
      const page = await service.previewConferences(
        {
          connection_id: source.connectionId,
          start_time: source.startTime,
          end_time: source.endTime,
          meeting_code: source.meetingCode,
          page_token: source.pageToken,
        },
        source.organizationId,
      );
      if (!mounted.current || generation.current !== intent) return;
      if (pageToken) conferenceTokens.current.add(pageToken);
      setConferencePage(page);
      setConferenceSource(source);
      setTranscriptPage(null);
      setTranscriptSource(null);
      setSelectedConference(null);
    } catch (error) {
      if (mounted.current && generation.current === intent) {
        setFailedConferenceSource(source);
        setProblem(errorText(error));
      }
    } finally {
      if (mounted.current && generation.current === intent) {
        inflight.current = null;
        setBusy(null);
      }
    }
  };

  const selectConference = (conferenceName: string) => {
    generation.current += 1;
    transcriptTokens.current.clear();
    setSelectedConference(conferenceName);
    setTranscriptPage(null);
    setTranscriptSource(null);
    setFailedTranscriptSource(null);
    setProblem(null);
  };
  const loadTranscript = async (
    transcriptName: string,
    pageToken: string | null = null,
    frozen: TranscriptSource | null = null,
  ) => {
    if (inflight.current || !selectedConference || !connectionId) return;
    if (pageToken && transcriptTokens.current.has(pageToken)) {
      setProblem(
        "This transcript page was already shown; the provider repeated its page token.",
      );
      return;
    }
    const source: TranscriptSource = Object.freeze(
      frozen
        ? { ...frozen, pageToken }
        : {
            organizationId: context.organizationId,
            connectionId,
            conferenceName: selectedConference,
            transcriptName,
            pageToken,
          },
    );
    if (!eligible.some((connection) => connection.id === source.connectionId)) {
      setProblem("That Google account is no longer eligible for Meet review.");
      return;
    }
    if (!pageToken) transcriptTokens.current.clear();
    setTranscriptPage(null);
    setTranscriptSource(null);
    setFailedTranscriptSource(null);
    const intent = ++generation.current;
    inflight.current = "transcript";
    setBusy("transcript");
    setProblem(null);
    try {
      const page = await service.previewTranscriptEntries(
        {
          connection_id: source.connectionId,
          conference_record_name: source.conferenceName,
          transcript_name: source.transcriptName,
          page_token: source.pageToken,
        },
        source.organizationId,
      );
      if (!mounted.current || generation.current !== intent) return;
      if (pageToken) transcriptTokens.current.add(pageToken);
      setTranscriptPage(page);
      setTranscriptSource(source);
    } catch (error) {
      if (mounted.current && generation.current === intent) {
        setFailedTranscriptSource(source);
        setProblem(errorText(error));
      }
    } finally {
      if (mounted.current && generation.current === intent) {
        inflight.current = null;
        setBusy(null);
      }
    }
  };

  const conference =
    conferencePage?.conferences.find(
      (item) => item.name === selectedConference,
    ) ?? null;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Meet source reviewer"
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          <p className="type-body text-muted-foreground">
            Read-only preview; nothing is saved or imported.
          </p>
          <GoogleAccountSelect
            connections={eligible}
            connectionId={connectionId}
            onConnectionChange={(id) => {
              invalidate();
              setConnectionId(id);
            }}
            label="Google account with Meet read access"
            disabled={busy !== null}
            requireExplicitSelection
          />
          {eligible.length === 0 ? (
            <p className="rounded-md border border-border p-3 type-body text-muted-foreground">
              No connected account has Meet read access.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              From
              <Input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => {
                  invalidate();
                  setStartLocal(event.target.value);
                }}
                disabled={busy !== null}
              />
            </label>
            <label className="grid gap-1 text-sm">
              To
              <Input
                type="datetime-local"
                value={endLocal}
                onChange={(event) => {
                  invalidate();
                  setEndLocal(event.target.value);
                }}
                disabled={busy !== null}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Meeting code (optional)
            <Input
              value={meetingCode}
              onChange={(event) => {
                invalidate();
                setMeetingCode(event.target.value);
              }}
              disabled={busy !== null}
            />
          </label>
          <Button
            variant="primary"
            type="button"
            onClick={() => void loadConferences()}
            disabled={busy !== null || !connectionId}
          >
            {" "}
            {busy === "conferences"
              ? "Previewing conferences…"
              : "Preview conferences"}
          </Button>
          {problem ? <ErrorNotice error={problem} /> : null}
          {failedConferenceSource ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void loadConferences(
                  failedConferenceSource.pageToken,
                  failedConferenceSource,
                )
              }
            >
              Retry conference preview
            </Button>
          ) : null}
          {failedTranscriptSource ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void loadTranscript(
                  failedTranscriptSource.transcriptName,
                  failedTranscriptSource.pageToken,
                  failedTranscriptSource,
                )
              }
            >
              Retry transcript entries
            </Button>
          ) : null}
          {conferencePage ? (
            <div className="space-y-2">
              <p className="type-title">Conferences</p>
              {conferencePage.conferences.length === 0 ? (
                <p className="type-body text-muted-foreground">
                  No conferences matched this source window.
                </p>
              ) : (
                conferencePage.conferences.map((item) => (
                  <ControlButton variant="outline" key={item.name} data-clickable onClick={() => selectConference(item.name)} disabled={busy !== null} className="w-full min-w-0">
                    <span className="block min-w-0 font-medium [overflow-wrap:anywhere]">
                      {item.space_name}
                    </span>
                    <span className="block min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
                      {item.start_time ?? "Start unavailable"} · transcripts:{" "}
                      {item.transcripts.state} · recordings:{" "}
                      {item.recordings.state}
                    </span>
                  </ControlButton>
                ))
              )}
              {conferencePage.next_page_token && conferenceSource ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void loadConferences(
                      conferencePage.next_page_token ?? null,
                      conferenceSource,
                    )
                  }
                >
                  Next conferences
                </Button>
              ) : null}
            </div>
          ) : null}
          {conference ? (
            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <p className="type-title">Transcript choices</p>
              {conference.transcripts.state !== "available" ? (
                <p className="type-body text-muted-foreground">
                  Transcript metadata is {conference.transcripts.state}.
                </p>
              ) : null}
              {conference.transcripts.names?.map((name) => (
                <Tile
                  key={name}
                  title={name}
                  disabled={busy !== null}
                  onClick={() => void loadTranscript(name)}
                />
              )) ?? null}
              {conference.transcripts.state === "available" &&
              !conference.transcripts.names?.length ? (
                <p className="type-body text-muted-foreground">
                  No transcript choices were returned.
                </p>
              ) : null}
            </div>
          ) : null}
          {transcriptPage ? (
            <div className="min-w-0 space-y-2">
              <p className="type-title">Transcript entries</p>
              {transcriptPage.entries.map((entry) => (
                <article
                  key={entry.name}
                  className="min-w-0 rounded-md border border-border p-3 type-body"
                >
                  <p className="type-secondary text-muted-foreground">
                    {entry.start_time ?? "Time unavailable"}
                  </p>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {entry.text}
                  </p>
                </article>
              ))}
              {transcriptPage.entries.length === 0 ? (
                <p className="type-body text-muted-foreground">
                  No entries were returned for this transcript.
                </p>
              ) : null}
              {transcriptPage.next_page_token && transcriptSource ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void loadTranscript(
                      transcriptSource.transcriptName,
                      transcriptPage.next_page_token ?? null,
                      transcriptSource,
                    )
                  }
                >
                  Next entries
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Production wrapper derives canonical source context; the body owns every screen state. */
export function MeetReview() {
  const organization = useOrganizationRequired();
  const actorId = useAppSelector(selectUserId);
  const inventory = useGoogleConnectionInventory();
  if (organization.organizationState !== "ready")
    return (
      <OrganizationContextNotice
        state={organization.organizationState}
        what="Meet source review"
      />
    );
  if (!actorId)
    return (
      <p className="p-3 type-body text-muted-foreground">
        Sign in to review Meet sources.
      </p>
    );
  if (inventory.isLoading)
    return (
      <div className="space-y-2 p-3">
        <Skeleton shape="block" height="sm" />
        <Skeleton shape="block" height="sm" />
      </div>
    );
  if (inventory.error)
    return (
      <ErrorNotice error="We could not load Google accounts for Meet review. Try again." />
    );
  if (!organization.organizationId) return null;
  const connections = inventory.data?.connections ?? [];
  return (
    <MeetReviewBody
      context={{
        organizationId: organization.organizationId,
        actorId,
        connections,
      }}
    />
  );
}
