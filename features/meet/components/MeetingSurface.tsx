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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MeetProvider,
  MeetingRoom,
  createMeetRepository,
  useMeetHost,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import type { MeetDiagnostic } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { Loader2 } from "lucide-react";
import { Button, Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { meetBaseUrl } from "@/features/meet/lib/meetBaseUrl";
import { useAppStore } from "@/lib/redux/hooks";

type Resolution =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly meeting: MeetingRecord }
  | { readonly state: "failed"; readonly message: string; readonly remedy: string };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-textured p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function MeetingSurface({
  slug,
  isAuthenticated,
}: {
  slug: string;
  isAuthenticated: boolean;
}) {
  const [resolution, setResolution] = useState<Resolution>({ state: "loading" });

  useEffect(() => {
    let live = true;
    const repository = createMeetRepository({ client: supabase });
    void repository
      .meetingBySlug(slug)
      .then((meeting) => {
        if (live) setResolution({ state: "ready", meeting });
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        // The package's own error carries the remedy. Nothing is invented here.
        const message =
          (thrown as Error)?.message ?? "This meeting link could not be opened.";
        const remedy =
          (thrown as { remedy?: string }).remedy ??
          "Check the link — meeting links exclude the characters people mishear " +
            "(no 0/O, no 1/l). If it was shared with you, ask the organizer to resend it.";
        setResolution({ state: "failed", message, remedy });
      });
    return () => {
      live = false;
    };
  }, [slug]);

  if (resolution.state === "loading") {
    return (
      <Centered>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Opening this meeting…
        </div>
      </Centered>
    );
  }

  if (resolution.state === "failed") {
    return (
      <Centered>
        <h1 className="text-base font-semibold">This meeting did not open</h1>
        <p className="mt-2 text-sm text-muted-foreground">{resolution.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">{resolution.remedy}</p>
      </Centered>
    );
  }

  return isAuthenticated ? (
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
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (host !== null) return undefined;
    const timer = setTimeout(() => setGaveUp(true), 8000);
    return () => clearTimeout(timer);
  }, [host]);

  if (host === null) {
    if (!gaveUp) {
      return (
        <Centered>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing your meeting…
          </div>
        </Centered>
      );
    }
    return (
      <Centered>
        <h1 className="text-base font-semibold">
          You are signed in, but no organization is active
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A meeting is minted for one organization, so calls and meetings stay
          inert until one is chosen. Pick your organization from the account menu
          and reload this link.
        </p>
      </Centered>
    );
  }

  return (
    <div className="h-dvh w-full">
      {/* NO CONSENT BANNER HERE. `<MeetingRoom>` renders the package's own
          notice for every participant since @ai-matrx/meet 0.3.0 (D10) — the
          host stand-in that used to live in this file was deleted in the same
          session that adopted it. */}
      <MeetingRoom
        roomName={meeting.roomName}
        meetingId={meeting.id}
        slug={meeting.slug}
      />
    </div>
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
function GuestRoom({ meeting, slug }: { meeting: MeetingRecord; slug: string }) {
  const store = useAppStore();
  const [typedName, setTypedName] = useState("");
  const [guestName, setGuestName] = useState<string | null>(null);
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

  if (guestName === null) {
    return (
      <Centered>
        <h1 className="text-base font-semibold">{meeting.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You are joining as a guest. No account needed — the host will let you
          in from the waiting room.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = typedName.trim();
            if (trimmed.length === 0) return;
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
              className="text-base"
            />
          </div>
          <Button type="submit" disabled={typedName.trim().length === 0}>
            Continue
          </Button>
        </form>
      </Centered>
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
      <div className="h-dvh w-full">
        <MeetingRoom
          roomName={meeting.roomName}
          meetingId={meeting.id}
          slug={slug}
        />
      </div>
    </MeetProvider>
  );
}
