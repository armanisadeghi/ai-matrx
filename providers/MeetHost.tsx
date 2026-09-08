// providers/MeetHost.tsx
//
// THE ONE `@ai-matrx/meet` MOUNT for this app.
//
// It sits INSIDE `<RealtimeHost>` and OUTSIDE `<MessagingHost>`, and both halves
// of that sandwich are deliberate:
//
//   inside RealtimeHost  — `<MeetProvider>` renders a `<RealtimeProvider>` of
//     its own, which since `@ai-matrx/realtime` 0.3.0 PROBES for a manager
//     already above it and rides that one. So calls, meetings, messaging and
//     every other realtime consumer in this app share ONE socket and ONE write
//     ledger. A second manager would make each side's optimistic writes look
//     remote to the other.
//   outside MessagingHost — the two invitation handlers
//     (`createCallInviteHandler` / `createMeetingInviteHandler`) are registered
//     on `<MessagingProvider actions={...}>`, and they need this provider's
//     `calls` and `repository`. `<MessagingHost>` reads them through
//     `useMeetHost()`, which is only possible if Meet is the outer of the two.
//
// `<IncomingCallHost />` is mounted here, once. That is what makes a call ring
// on whatever surface the user is on rather than only on a meeting page.
//
// The host injects IDENTITY and app chrome (C22) and nothing else:
//
//   identity — the Supabase browser singleton, the signed-in user and their
//              display name, the active org, aidream's base URL (the same
//              `resolveBaseUrl` every `callApi` request uses), the access-token
//              source, the app's ONE production transport, and WHO fulfils each
//              of the package's four in-meeting jobs
//   chrome   — a router so an accepted call lands on `/meet/<room>`, and a
//              diagnostic sink that screams with a remedy
//
// 🚨 THE AI IDENTITY COMES FROM MANDATES, NEVER FROM A CONFIG LINE. See
// `features/meet/lib/meetMandates.ts`: no `meet.*` mandate row exists yet
// (MRI-A5 declares them and 0.3.0 removes `MeetAgents` entirely), so today the
// identity map is empty, `createMeetAi` reports every capability unavailable,
// and the package's `AiControl` renders NOTHING. Absent, never a dead button,
// never a hardcoded agent id.
//
// 🚨 A SIGNED-OUT VISITOR GETS NO ENGINE. The provider stays inert until userId
// and organizationId are both real. The GUEST meeting path does not come
// through here at all — `/meet/[slug]` mounts its own scoped provider with
// `guestName` and no session (D6/D12), which is the only lane in the app that
// legitimately has a Meet runtime without a user.
//
// Doctrine: the package's README (eleven rules) + `common-docs`
// /systems/communications/meet/HANDOFF.md.

"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MeetProvider } from "@ai-matrx/meet/react";
import type { MeetDiagnostic } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { IncomingCallHost } from "@ai-matrx/meet/react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import {
  selectActiveUserAvatarUrl,
  selectDisplayName,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useMeetIntelligences } from "@/features/meet/lib/useMeetIntelligences";
import { meetBaseUrl } from "@/features/meet/lib/meetBaseUrl";
import { toast } from "@/lib/toast";

export interface MeetHostProps {
  children: ReactNode;
}

export function MeetHost({ children }: MeetHostProps) {
  const pathname = usePathname();
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);
  const displayName = useAppSelector(selectDisplayName);
  const avatarUrl = useAppSelector(selectActiveUserAvatarUrl);
  const organizationId = useAppSelector(selectActiveOrganizationId);

  // The app's ONE production transport for `@ai-matrx/agents` calls — the same
  // pipeline `useRunAgent`, the execution system and `<MessagingHost>` ride, so
  // a token refresh, the AI-version flag, org admission and error capture all
  // behave here exactly as they do everywhere else.
  const transport = useMemo(
    () => createMatrxTransport(store.getState, { source: "meetHost" }),
    [store],
  );

  // A MEETING SURFACE IS THE ONLY PLACE THE MEET AI CAN APPEAR, so it is the
  // only place the four mandates are asked about. This provider is app-wide (a
  // call must ring everywhere); resolving on mount would fire four requests on
  // every route in the app, which is the exact defect `<MessagingHost>` was
  // repaired for on 2026-09-08.
  const { agents } = useMeetIntelligences({
    enabled: pathname?.startsWith("/meet/") === true,
  });

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  // One toast per distinct remedy — a broken socket retrying does not get to
  // stack fifty of them. Warnings and info go to the console only.
  const shownRef = useRef<Set<string>>(new Set());
  const onDiagnostic = useCallback((event: MeetDiagnostic) => {
    const line = `[meet] ${event.message}${
      event.remedy !== undefined ? ` → ${event.remedy}` : ""
    }`;
    if (event.level === "error") {
      console.error(line);
      if (!shownRef.current.has(event.message)) {
        shownRef.current.add(event.message);
        toast.error(event.message, {
          ...(event.remedy !== undefined
            ? { description: event.remedy }
            : {}),
        });
      }
      return;
    }
    if (event.level === "warn") console.warn(line);
    else console.info(line);
  }, []);

  return (
    <MeetProvider
      client={supabase}
      baseUrl={meetBaseUrl(store.getState())}
      userId={userId}
      organizationId={organizationId}
      displayName={displayName}
      avatarUrl={avatarUrl}
      accessToken={accessToken}
      transport={transport}
      agents={agents}
      onDiagnostic={onDiagnostic}
    >
      {/* Mount ONCE, high in the tree — a call rings on every surface. Mounted
          DIRECTLY: since @ai-matrx/meet 0.2.1 it renders nothing on its own
          while this provider is inert (which is every server render and every
          signed-out visitor), so there is nothing for this app to guard. */}
      <IncomingCallHost />
      {children}
    </MeetProvider>
  );
}

export default MeetHost;
