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
//              `resolveBaseUrl` every `callApi` request uses), and the
//              access-token source
//   chrome   — a router so an accepted call lands on `/meet/<room>`, and a
//              diagnostic sink that screams with a remedy
//
// 🚨 THIS APP INJECTS NO AI IDENTITY AT ALL, and as of `@ai-matrx/meet` 0.3.0
// there is no prop for one. Which agent takes notes, answers a question, or
// writes the wrap-up is a Mandate binding the SERVER resolves at run time
// (`meet.live_notes`, `meet.live_intelligence`, `meet.wrap_up`), so an
// organization rebinds a job in the Mandate admin with no deploy of this app.
// `features/meet/lib/meetMandates.ts` and `useMeetIntelligences.ts` existed
// only to inject those ids and were DELETED when 0.3.0 was adopted — a mandate
// with no Holder now produces the server's own refusal on the meeting screen,
// which is more honest than a control that silently never appeared.
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

import { useCallback, useRef, type ReactNode } from "react";
import { MeetProvider } from "@ai-matrx/meet/react";
import type { MeetDiagnostic } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { IncomingCallHost } from "@ai-matrx/meet/react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectActiveUserAvatarUrl,
  selectDisplayName,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { meetBaseUrl } from "@/features/meet/lib/meetBaseUrl";
import { toast } from "@/lib/toast";

export interface MeetHostProps {
  children: ReactNode;
}

export function MeetHost({ children }: MeetHostProps) {
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);
  const displayName = useAppSelector(selectDisplayName);
  const avatarUrl = useAppSelector(selectActiveUserAvatarUrl);
  const organizationId = useAppSelector(selectActiveOrganizationId);

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
