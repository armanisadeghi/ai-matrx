"use client";

// features/meet/components/MeetingSurface.tsx
//
// THE ROOM BEHIND A DURABLE LINK — both lanes, one component (D6/D12).
//
//   signed in → the app-wide `<MeetHost>` provider is already mounted with the
//               person's real identity and active organization, so this renders
//               `<MeetingRoom>` straight into it. No name prompt: an
//               authenticated participant already has a name.
//   guest     → a ROOM-SCOPED `<MeetProvider>` with `guestName`, no session and
//               the meeting's own organization. That provider builds no call
//               center at all (D6), so nothing anywhere renders a call control
//               a guest could not use.
//
// The slug is resolved through the package's repository, which calls
// `communication.meet_meeting_by_slug` — an RPC granted to `anon` as well as
// `authenticated`, which is what makes the guest lane real. A slug that does
// not resolve says so, with what to do about it; it never spins.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  MeetProvider,
  MeetRoot,
  asMeetingId,
  createMeetRepository,
  refusalPhase,
  useMeetHost,
  type MeetPhase,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import type { MeetDiagnostic } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { meetBaseUrl } from "@/features/meet/lib/meetBaseUrl";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectIsAuthenticated,
} from "@/lib/redux/selectors/userSelectors";
import { MeetingLayout } from "@/features/meet/components/MeetingLayout";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { selectOrganizations } from "@/features/scopes/redux/selectors/tree";
import { useMeetMemberIdentity } from "@/providers/MeetHost";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { MEET_PLACES } from "@/features/meet/intelligence-places";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import { MeetingInviteButton } from "@/features/meet/components/invite/MeetingInviteButton";
import { PreJoinRsvp } from "@/features/meet/components/manage/PreJoinRsvp";
import {
  KeepNotesPrompt,
  useGuestClaimOnArrival,
} from "@/features/meet/components/KeepNotes";

// The meeting's AI jobs (live notes, answers, the wrap-up), disclosed IN the
// room through the package's `headerControls` slot (@ai-matrx/meet 0.7.0).
const MEETING_JOBS = MEET_PLACES.places.flatMap((place) => place.mandateKeys);

type Resolution =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly meeting: MeetingRecord }
  | {
      readonly state: "failed";
      readonly message: string;
      readonly remedy: string;
      readonly detail: string;
      /** The observation contract's phase for this dead end (HARNESS-CONTRACT §2). */
      readonly phase: MeetPhase;
    };

/**
 * EMBEDDED — the room runs inside a host's box (a meeting tile on the Board)
 * instead of owning the viewport. Every screen fills that box (the package's
 * `--mx-meet-height`, @ai-matrx/meet 0.7.78), nothing touches the address
 * bar, and `onLeave` takes the host back to the meeting's home — after Leave,
 * or from the Back control before joining.
 */
const EmbeddedContext = createContext<{ onLeave: () => void } | null>(null);

const CONTAINED: CSSProperties = {
  "--mx-meet-height": "100%",
} as CSSProperties;

/** The box every room screen draws into: the viewport, or the host's box. */
function Stage({ children }: { children: React.ReactNode }) {
  const embedded = useContext(EmbeddedContext);
  return embedded ? (
    <div className="h-full w-full" style={CONTAINED}>
      {children}
    </div>
  ) : (
    <div className="h-dvh w-full">{children}</div>
  );
}

/** Back to the meeting's home — drawn only when embedded. */
function BackToMeeting() {
  const embedded = useContext(EmbeddedContext);
  if (!embedded) return null;
  return (
    <Button
      icon={<ArrowLeft aria-hidden="true" />}
      type="button"
      variant="outline"
      onClick={embedded.onLeave}
    >
      Details
    </Button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const embedded = useContext(EmbeddedContext) !== null;
  return (
    <div
      className={`relative flex w-full items-center justify-center bg-textured p-6 ${
        embedded ? "h-full" : "h-dvh"
      }`}
    >
      {embedded ? (
        <div className="absolute left-3 top-3">
          <BackToMeeting />
        </div>
      ) : null}
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function MeetingSurface({
  slug,
  isAuthenticated,
  chrome = "page",
  onLeave,
}: {
  slug: string;
  isAuthenticated: boolean;
  /**
   * `page` — the durable link (/meet/[slug]): the stage owns the viewport.
   * `embedded` — inside a host's box (a meeting tile on the Board); requires
   * `onLeave`.
   */
  chrome?: "page" | "embedded";
  /** Embedded: the person left the room or went back to the meeting's home. */
  onLeave?: () => void;
}) {
  const embedded =
    chrome === "embedded" && onLeave !== undefined ? { onLeave } : null;
  return (
    <EmbeddedContext.Provider value={embedded}>
      <MeetingSurfaceBody slug={slug} isAuthenticated={isAuthenticated} />
    </EmbeddedContext.Provider>
  );
}

function MeetingSurfaceBody({
  slug,
  isAuthenticated,
}: {
  slug: string;
  isAuthenticated: boolean;
}) {
  const embedded = useContext(EmbeddedContext) !== null;
  const [resolution, setResolution] = useState<Resolution>({
    state: "loading",
  });
  // The page's server auth value is a safe first-render snapshot, not a
  // permanent client identity. GlobalAuthSync resolves the browser session
  // after hydration into the canonical reactive Redux state.
  // Keep the server lane only while that authority is unknown; switching
  // earlier could mount a member runtime before a browser session exists.
  const authReady = useAppSelector(selectAuthReady);
  const authenticatedNow = useAppSelector(selectIsAuthenticated);
  const useMemberRoom = authReady ? authenticatedNow : isAuthenticated;

  useEffect(() => {
    let live = true;
    const repository = createMeetRepository({ client: supabase });
    // A share notification names the meeting RECORD, so its door is
    // `/meet/<meeting id>` (entity registry `meet_meeting.hrefFor`). A slug is
    // never uuid-shaped, so a uuid here is an id: read it (the invitee's grant
    // is what lets RLS answer) and put the durable slug link in the address bar.
    const byId = isUuidValue(slug);
    void (
      byId
        ? repository.meeting(asMeetingId(slug))
        : repository.meetingBySlug(slug)
    )
      .then((meeting) => {
        if (!live) return;
        // Embedded, the address bar belongs to the host (the Board).
        if (byId && !embedded)
          window.history.replaceState(null, "", `/meet/${meeting.slug}`);
        setResolution({ state: "ready", meeting });
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        // The person reads the sentence, never the operation tag a server
        // error carries ("meet_meeting_by_slug: ...");
        // the untouched text still reaches the error menu below.
        const raw = (thrown as Error)?.message ?? "";
        const sentence = raw.replace(/^[A-Za-z_.]+(\([^)]*\))?:\s*/, "");
        const reason = (thrown as { reason?: string | null }).reason ?? null;
        const message =
          reason === "not_found"
            ? "No meeting matches that link."
            : sentence.length > 0
              ? sentence.charAt(0).toUpperCase() + sentence.slice(1)
              : "This meeting link could not be opened.";
        // A link that matches no meeting is not transient: "retry in a
        // moment" (the generic server remedy) would send them in circles.
        const linkRemedy =
          "Check the link — meeting links exclude the characters people mishear " +
          "(no 0/O, no 1/l). If it was shared with you, ask the organizer to resend it.";
        // THE SCREEN IS DECIDED BY THE REASON CODE the package attached (one
        // vocabulary with the server, CORE-DESIGN §2.5) - never by the message text.
        const remedy =
          reason === "not_found"
            ? linkRemedy
            : ((thrown as { remedy?: string }).remedy ?? linkRemedy);
        // One rule with the core's machine: `ended` → `ended`, a gate reason → `refused:*`,
        // anything else → `disconnected` (CORE-DESIGN §3.1).
        const phase = refusalPhase(reason ?? null);
        setResolution({
          state: "failed",
          message,
          remedy,
          detail: raw || message,
          phase,
        });
      });
    return () => {
      live = false;
    };
  }, [slug, embedded]);

  // Every screen here carries the package's ONE observation root (S0), so the
  // scenario harness reads this page the same way before and inside the room.
  if (resolution.state === "loading") {
    return (
      <MeetRoot phase="resolving">
        <Centered>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Opening this meeting…
          </div>
        </Centered>
      </MeetRoot>
    );
  }

  if (resolution.state === "failed") {
    const reason = resolution.phase.startsWith("refused:")
      ? resolution.phase.slice("refused:".length)
      : null;
    return (
      <MeetRoot phase={resolution.phase} reason={reason}>
        <Centered>
          <h1 className="text-base font-semibold">This meeting did not open</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {resolution.message} <ErrorAlchemyMenu error={resolution.detail} />
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {resolution.remedy}
          </p>
          {/* A link that opened nothing is never a dead end: back to the
              meetings list (where codes and links are opened) or home. */}
          <div className="mt-4 flex gap-2">
            <Button asChild variant="primary">
              <a href="/meetings">Back to meetings</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/">Go home</a>
            </Button>
          </div>
        </Centered>
      </MeetRoot>
    );
  }

  return useMemberRoom ? (
    <MemberRoom meeting={resolution.meeting} />
  ) : (
    <GuestRoom meeting={resolution.meeting} slug={slug} />
  );
}

/**
 * The signed-in lane. `<MeetHost>` is already mounted app-wide, so the ONLY
 * thing this adds is the room itself.
 *
 * A host that is still null is a real, nameable state — Redux identity and the
 * active organization hydrate a moment after the page does — so it is reported
 * as such after a short grace rather than spinning forever. Every failure this
 * app can have here has a sentence.
 */
function MemberRoom({ meeting }: { meeting: MeetingRecord }) {
  const host = useMeetHost();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const organizations = useAppSelector(selectOrganizations);
  const memberOfMeetingOrg =
    organizations[meeting.organizationId] !== undefined;
  // 🚨 A MEETING LINK NEVER ASKS FOR AN ORGANIZATION (verifier, 2026-09-27).
  // The app-wide `<MeetHost>` is scoped to the ACTIVE organization and stays
  // inert without one — so a person with no active organization was stopped
  // by "An organization is needed" at the door. The meeting names its own
  // organization; when the person belongs to it, the room is scoped to it.
  // Latched: once chosen, a later org switch never rebuilds a live call.
  const [scoped, setScoped] = useState(false);
  // An EXISTING record runs in ITS OWN organization, never the active one
  // (law: active-org-is-never-a-list-filter, rule 5). So the room is scoped to
  // the meeting's organization whenever the app-wide host is inert OR is bound
  // to a DIFFERENT organization than the meeting's.
  const hostOrganizationId = host?.identity?.organizationId ?? null;
  useEffect(() => {
    if (scoped || !memberOfMeetingOrg) return;
    if (host === null && activeOrganizationId === null) setScoped(true);
    else if (host !== null && hostOrganizationId !== meeting.organizationId)
      setScoped(true);
  }, [
    scoped,
    host,
    activeOrganizationId,
    hostOrganizationId,
    memberOfMeetingOrg,
    meeting.organizationId,
  ]);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (host !== null) return undefined;
    const timer = setTimeout(() => setGaveUp(true), 8000);
    return () => clearTimeout(timer);
  }, [host]);

  if (scoped) return <MeetingScopedMemberRoom meeting={meeting} />;

  if (host === null) {
    if (!gaveUp) {
      return (
        <MeetRoot phase="resolving">
          <Centered>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Preparing your meeting…
            </div>
          </Centered>
        </MeetRoot>
      );
    }
    // 🚨 YOU DO NOT NEED AN ORGANIZATION TO JOIN A MEETING (Arman, 2026-10-01).
    // A signed-in person outside the meeting's organization with no active
    // organization yet is never stopped at the door: they join through the
    // guest lane — the same rules every link-holder has — instead of a prompt.
    return (
      <GuestRoom meeting={meeting} slug={meeting.slug} offerAccount={false} />
    );
  }

  return <MemberRoomBody meeting={meeting} />;
}

/**
 * The signed-in lane scoped to the MEETING's organization — a member-lane
 * `<MeetProvider>` (the person's own session, never a guest) whose
 * organization is the meeting's. Used only while the app-wide host is inert,
 * so there is never a second call center beside it.
 */
function MeetingScopedMemberRoom({ meeting }: { meeting: MeetingRecord }) {
  const identity = useMeetMemberIdentity();
  return (
    <MeetProvider {...identity} organizationId={meeting.organizationId}>
      <MemberRoomBody meeting={meeting} />
    </MeetProvider>
  );
}

function MemberRoomBody({ meeting }: { meeting: MeetingRecord }) {
  // Back from "Create free account" with `?claim=1`: the guest's attendance
  // joins the new account, then the record re-reads as theirs.
  const claimGeneration = useGuestClaimOnArrival(meeting);
  const embedded = useContext(EmbeddedContext);
  return (
    <Stage>
      {/* NO CONSENT BANNER HERE. `<MeetingRoom>` renders the package's own
          notice for every participant since @ai-matrx/meet 0.3.0 (D10) — the
          host stand-in that used to live in this file was deleted in the same
          session that adopted it. */}
      {/* THE RESOLVED ROW TRAVELS WITH THE ROOM (MRI-D2). `<MeetingRoom>`
          renders the meeting RECORD instead of a pre-join screen once
          `ended_at` is set, and this prop is how it knows before — or without —
          a durable-feed read. */}
      {/* Room or Board — the viewer's choice while connected; everything
          before and after the room is still `<MeetingSkinRoot>` (MeetingLayout). */}
      <MeetingLayout
        key={claimGeneration}
        roomName={meeting.roomName}
        meetingId={meeting.id}
        slug={meeting.slug}
        meeting={meeting}
        // INVITE (both lanes) + the AI jobs (signed-in lane only: a guest has
        // no account to open the jobs with). Invite also sits in the pre-join
        // corner, where the package draws no header — beside "Going?" for an
        // invited person.
        preJoinControls={
          <>
            <BackToMeeting />
            <PreJoinRsvp meeting={meeting} />
            {/* The lobby is the page surface (--mx-meet-bg), not the dark
                stage: the stage look drew a white-on-white Invite here. */}
            <MeetingInviteButton meeting={meeting} signedIn look="row" />
          </>
        }
        endedControls={embedded ? <BackToMeeting /> : undefined}
        onLeave={embedded?.onLeave}
        headerControls={
          <span className="inline-flex items-center gap-2">
            <MeetingInviteButton meeting={meeting} signedIn />
            <IntelligenceIndicator
              feature="meet"
              mandateKeys={MEETING_JOBS}
              label="The AI jobs in this meeting (live notes, answers, the wrap-up)"
              size="md"
              // The meeting stage is dark in both themes (--mx-meet-stage-bg), so the
              // page-default primary-on-light chip reads as a dim dot here. Stage text
              // on a light glass, a 44pt target on touch, 36px from `sm` up.
              className="h-11 w-11 border-white/30 bg-white/10 text-[color:var(--mx-meet-stage-text)] hover:bg-white/20 focus-visible:ring-white/60 sm:h-9 sm:w-9 [&_svg]:h-[18px] [&_svg]:w-[18px]"
            />
          </span>
        }
      />
    </Stage>
  );
}

/**
 * The guest lane (D6). A link works for anyone: they type a name, get a
 * room-scoped runtime with no session, and wait in the lobby until the host
 * admits them.
 *
 * The name is asked for BEFORE the provider mounts because `guestName` is part
 * of the provider's identity — changing it later would rebuild every channel.
 */
/** Where this device remembers a guest's display name (per viewer, CORE-DESIGN §3.5). */
const GUEST_NAME_KEY = "matrx.meet.guest-name";
/** `@ai-matrx/meet`'s per-browser guest device id (the guest's person key). */
const GUEST_DEVICE_KEY = "mx.meet.device";

function GuestRoom({
  meeting,
  slug,
  offerAccount = true,
}: {
  meeting: MeetingRecord;
  slug: string;
  /** False when the person is already signed in (no active org yet). */
  offerAccount?: boolean;
}) {
  const store = useAppStore();
  const embedded = useContext(EmbeddedContext);
  const [typedName, setTypedName] = useState("");
  // 🚨 AN ENDED MEETING NEVER ASKS FOR A NAME (MRI-D2). There is no room to
  // announce anybody into; the link resolves to the record. The provider still
  // mounts — the record view needs a runtime to read through, and the honest
  // sentences it renders when the database refuses a link-follower are the
  // whole point of that lane.
  const ended = meeting.endedAt !== null;
  // The guest's name is remembered on this device (CORE-DESIGN §3.5, per viewer, local
  // storage): a reload or a second visit never asks again. `undefined` = not read yet
  // (rendered as `resolving`, never as the name step, so a reload never flashes it).
  const [guestName, setGuestName] = useState<string | null | undefined>(
    ended ? "Guest" : undefined,
  );
  useEffect(() => {
    if (guestName !== undefined) return;
    let remembered: string | null = null;
    try {
      remembered = window.localStorage.getItem(GUEST_NAME_KEY);
    } catch {
      remembered = null;
    }
    setGuestName(remembered !== null && remembered.trim().length > 0 ? remembered : null);
  }, [guestName]);
  const baseUrl = useMemo(() => meetBaseUrl(store.getState()), [store]);
  const noSession = useCallback(async () => null, []);
  const onDiagnostic = useCallback((event: MeetDiagnostic) => {
    const line = `[meet:guest] ${event.message}${
      event.remedy !== undefined ? ` → ${event.remedy}` : ""
    }`;
    if (event.level === "error") console.error(line);
    else if (event.level === "warn") console.warn(line);
    else console.info(line);
  }, []);

  if (guestName === undefined) {
    return <MeetRoot phase="resolving">{null}</MeetRoot>;
  }

  if (guestName === null) {
    // The contract has no guest-name phase yet (CORE-DESIGN §3.7 C1): `prejoin`.
    return (
      <MeetRoot phase="prejoin">
        <Centered>
          <h1 className="text-base font-semibold">{meeting.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meeting.lobbyEnabled
              ? "No account needed · the host lets you in"
              : "No account needed"}
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = typedName.trim();
              if (trimmed.length === 0) return;
              try {
                window.localStorage.setItem(GUEST_NAME_KEY, trimmed);
              } catch {
                // Private mode: the name lives for this visit only.
              }
              setGuestName(trimmed);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="meet-guest-name">Your name</Label>
              <Input
                id="meet-guest-name"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="How should we announce you?"
                autoComplete="name"
                autoFocus
              />
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={typedName.trim().length === 0}
            >
              Continue
            </Button>
          </form>
        </Centered>
      </MeetRoot>
    );
  }

  return (
    <MeetProvider
      client={supabase}
      baseUrl={baseUrl}
      guestName={guestName}
      // A guest's capability is exactly this one room's organization, and their
      // token is scoped to exactly this room (R5). Nothing else is reachable.
      organizationId={meeting.organizationId}
      accessToken={noSession}
      onDiagnostic={onDiagnostic}
    >
      <Stage>
        <MeetingLayout
          roomName={meeting.roomName}
          meetingId={meeting.id}
          slug={slug}
          meeting={meeting}
          // A guest can pass the link on too; granting needs an account, so
          // the panel shows them the link, the invitation and the calendar.
          headerControls={
            <MeetingInviteButton meeting={meeting} signedIn={false} />
          }
          preJoinControls={
            <>
              <BackToMeeting />
              {/* A shared browser remembers the last guest: the next person changes it here,
                  and gets their own guest identity (never announced under the first's name). */}
              <Button
                type="button"
                variant="quiet"
                data-meet-control="change-guest-name"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(GUEST_NAME_KEY);
                    window.localStorage.removeItem(GUEST_DEVICE_KEY);
                  } catch {
                    // Private mode: nothing was remembered.
                  }
                  setTypedName("");
                  setGuestName(null);
                }}
              >
                {`Not ${guestName}?`}
              </Button>
              <MeetingInviteButton
                meeting={meeting}
                signedIn={false}
                look="row"
              />
            </>
          }
          // After the meeting: an offer to keep the notes, never a gate.
          endedControls={
            offerAccount ? (
              <KeepNotesPrompt slug={slug} />
            ) : embedded ? (
              <BackToMeeting />
            ) : undefined
          }
          onLeave={embedded?.onLeave}
        />
      </Stage>
    </MeetProvider>
  );
}
