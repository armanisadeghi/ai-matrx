// providers/MessagingHost.tsx
//
// THE ONE `@ai-matrx/messaging` MOUNT for this app.
//
// It sits INSIDE `<RealtimeHost>` on purpose. `<MessagingProvider>` rides the
// manager that provider already built (`@ai-matrx/realtime` 0.3.0 gave it the
// probe to notice one), so messaging's channels and the app's other realtime
// consumers share ONE socket and ONE write ledger — a second manager would make
// each side's own optimistic writes look remote to the other.
//
// Everything hard is inside the package: the conversation store and its four
// arrival paths, the durable outbox, echo suppression and dedup, the typing
// lease and presence expiry, keyset pagination, atomic direct-conversation
// creation, and the backfill door on every reconnect. This file injects
// IDENTITY and APP CHROME (C22) and nothing else:
//
//   identity — the Supabase browser singleton, the signed-in user, the active
//              org, the API transport, and WHO fulfils each of the package's
//              four conversation intelligences
//   chrome   — reference opening, the notification sound/desktop sink, action
//              surfaces, and a diagnostic sink that screams with a remedy
//
// 🚨 THE AI IDENTITY COMES FROM MANDATES, NEVER FROM A CONFIG LINE. An agent's
// definition lives in the DATABASE; a UUID in this file would be the exact
// thing the Mandate system exists to prevent. `useMessagingIntelligences`
// resolves the four `messaging.*` mandates and injects the resolved Holder AND
// its `config_overrides` — both halves, because passing the id alone drops
// whatever settings the winning binding decided. A job with no Holder is simply
// absent from the map, and the package then renders no chip for it: an absent
// affordance, never a dead button, never a fallback agent.
//
// It is mounted app-wide, not on /messages, because the unread badge in the
// header, the messages window panel, and the "Message" buttons in member panels
// all need it — the same reason the deleted `MessagingInitializer` was mounted
// globally. A signed-out visitor gets no engine at all: the provider stays inert
// until userId and organizationId are both real.
//
// Doctrine: the package's README (twelve rules) + `common-docs`
// /systems/communications/messaging/HANDOFF.md.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  MessagingProvider,
  toMessagingArchiveFilter,
  useConversations,
  useMessagingHost,
} from "@ai-matrx/messaging/react";
import type { MessagingArchiveFilter } from "@ai-matrx/messaging/react";
import type { ActionHandler } from "@ai-matrx/messaging";
// One entry point: `@ai-matrx/meet/react` re-exports the whole core, so a React
// file needs exactly one import specifier. (Through 0.2.0 this was a REQUIREMENT
// — the two declaration files re-declared every branded type — but 0.2.1 builds
// both entries in one dts pass, so it is now just the tidier habit.)
import {
  createCallInviteHandler,
  createMeetingInviteHandler,
  useMeetHost,
} from "@ai-matrx/meet/react";
import type {
  EngineDiagnostic,
  IncomingMessageContext,
  Message,
} from "@ai-matrx/messaging/react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { useMessagingIntelligences } from "@/features/messaging/lib/useMessagingIntelligences";
import {
  MessagingAiDemandProvider,
  useMessagingAiDemandCounter,
} from "@/features/messaging/lib/messagingAiDemand";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectArchivedDefault } from "@/lib/redux/preferences/userPreferenceSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { MESSAGE_ACTION_SURFACES } from "@/features/messaging/actions/messageActionSurfaces";
import {
  MessagingConversationRowChrome,
  MessagingFence,
  MessagingMessageChrome,
} from "@/features/messaging/components/MessagingChrome";
import { useIncomingMessageNotifier } from "@/features/messaging/lib/useIncomingMessageNotifier";
import { unlockAudio } from "@/features/messaging/utils/notificationSound";
import { toast } from "@/lib/toast";
import { verifiedMessagingUserId } from "./messagingIdentity";

export interface MessagingHostProps {
  children: ReactNode;
}

export function MessagingHost({ children }: MessagingHostProps) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  // THE ARCHIVED-ITEMS LAW clause 6 (`common-docs/policies/archived-items.md`):
  // the archive filter's starting state is the PERSON's setting, never this
  // file's taste. `lists.archivedDefault` is the same knob `useEntityList` and
  // `AgentCatalogHost` read, so every list in the app opens the same way.
  const archiveKnob = toMessagingArchiveFilter(
    useAppSelector(selectArchivedDefault),
  );
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const notifyIncoming = useIncomingMessageNotifier();
  const store = useAppStore();

  // Redux and the Supabase session hydrate independently and can briefly name
  // different accounts during sign-in, sign-out, or an account switch. The DM
  // RPCs intentionally require p_user_id = auth.uid(); do not call them until
  // both identity sources agree. RLS remains the authority and the provider
  // simply stays inert during the transition.
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSessionUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionUserId(session?.user.id ?? null);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const authenticatedUserId = verifiedMessagingUserId(userId, sessionUserId);

  // The app's ONE production transport for `@ai-matrx/agents` calls — the same
  // pipeline `useRunAgent` and the execution system ride, so a token refresh,
  // the AI-version flag, org admission and error capture all behave here
  // exactly as they do everywhere else. Built once: a new transport identity
  // per render would rebuild the package's AI client on every render.
  const transport = useMemo(
    () =>
      createMatrxTransport(store.getState, {
        source: "messagingHost",
      }),
    [store],
  );

  // 🚨 THE AI IDENTITY IS RESOLVED ON DEMAND, NOT ON MOUNT (2026-09-08).
  //
  // This provider is app-wide (see the block above — the unread badge and the
  // "Message" buttons need it everywhere), and it used to resolve the four
  // `messaging.*` mandates on every single route as a result. Measured on
  // production: `/mandates` and `/dashboard` each fired four
  // `GET /mandates/{key}/resolution` calls and logged four errors for a
  // conversation pane that was not on screen. A page must not resolve what it
  // does not run.
  //
  // `<ConversationPane>` — the one component in this app that renders the
  // package's `<ConversationView>` — declares the demand, and only then are the
  // four jobs (and the transcript-cap knob) asked about.
  const aiDemand = useMessagingAiDemandCounter();
  const { agents, maxTranscriptMessages } = useMessagingIntelligences({
    organizationId,
    userId,
    enabled: aiDemand.demanded,
  });

  // A background failure is never silent, and never a wall of red either: the
  // package classifies a missing session as a WARNING because it is a normal
  // lifecycle moment (a read landing between sign-in and token arrival). Only
  // real errors reach the user, and only once per remedy — a broken socket
  // retrying does not get to stack fifty toasts.
  const shownRef = useRef<Set<string>>(new Set());
  const onDiagnostic = useCallback((event: EngineDiagnostic) => {
    const line = `[messaging] ${event.message}${
      event.remedy !== undefined ? ` → ${event.remedy}` : ""
    }`;
    if (event.level === "error") {
      console.error(line);
      if (!shownRef.current.has(event.message)) {
        shownRef.current.add(event.message);
        toast.error(event.message, {
          ...(event.remedy !== undefined ? { description: event.remedy } : {}),
        });
      }
      return;
    }
    if (event.level === "warn") console.warn(line);
    else console.info(line);
  }, []);

  // THE MESSAGING SEAM (D8). A call or meeting invitation is an ACTIONABLE
  // MESSAGE, not a second notification system: `@ai-matrx/messaging` knows
  // nothing about meetings, and its action registry exists precisely so
  // `@ai-matrx/meet` can add a kind without messaging learning about them.
  //
  // Both handlers come from the meet package and carry the whole behaviour —
  // re-resolving the invite through the auth-checked RPC before joining
  // anything, refusing to render chips for an expired invite, settling once
  // across tabs. This file supplies only the two app-shaped answers: which
  // runtime to act on, and where a join lands.
  //
  // A GUEST HAS NO CALL CENTER (`host.calls` is null by construction, D6), and
  // a signed-out visitor has no meet host at all. In both cases the call
  // handler is simply not registered, so an invitation message renders NO chips
  // rather than a button that cannot work. The meeting handler needs no runtime
  // — a durable link opens for anyone — so it is always registered.
  const meetHost = useMeetHost();
  const meetCalls = meetHost?.calls ?? null;
  const meetRepository = meetHost?.repository ?? null;
  const actions = useMemo(() => {
    const list: ActionHandler<never>[] = [
      createMeetingInviteHandler({
        onOpen: (payload) => {
          router.push(`/meet/${payload.slug}`);
        },
      }) as unknown as ActionHandler<never>,
    ];
    if (meetCalls !== null && meetRepository !== null) {
      list.unshift(
        createCallInviteHandler({
          calls: meetCalls,
          repository: meetRepository,
          onJoin: (invite) => {
            router.push(`/meet/${invite.roomName}`);
          },
        }) as unknown as ActionHandler<never>,
      );
    }
    return list;
  }, [meetCalls, meetRepository, router]);

  const onOpenReference = useCallback(
    (reference: { entityType: string; entityId: string }) => {
      router.push(`/${reference.entityType}/${reference.entityId}`);
    },
    [router],
  );

  const onIncomingMessage = useCallback(
    (message: Message, context: IncomingMessageContext) => {
      notifyIncoming(message, context);
    },
    [notifyIncoming],
  );

  // Browsers refuse to play audio until the person has interacted with the
  // page, and the refusal is silent — so the notification sound is unlocked on
  // the first click/key/touch, once, or the first message of a session arrives
  // mute with nothing in the console to explain it.
  useEffect(() => {
    const handle = (): void => {
      unlockAudio();
      document.removeEventListener("click", handle);
      document.removeEventListener("keydown", handle);
      document.removeEventListener("touchstart", handle);
    };
    document.addEventListener("click", handle, { once: true });
    document.addEventListener("keydown", handle, { once: true });
    document.addEventListener("touchstart", handle, { once: true });
    return () => {
      document.removeEventListener("click", handle);
      document.removeEventListener("keydown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, []);

  return (
    <MessagingAiDemandProvider acquire={aiDemand.acquire}>
      <MessagingProvider
        client={supabase}
        userId={authenticatedUserId}
        organizationId={organizationId}
        // The AI seam: the transport, WHO fulfils each job (from Mandates, both
        // halves), how much history an organization is willing to send, and the
        // producer slugs the server's register accepts. An unregistered producer
        // is a 422, not a lost analytic — `matrx-frontend` / `messages` are the
        // registered pair for this surface (aidream source_attribution).
        transport={transport}
        agents={agents}
        maxTranscriptMessages={maxTranscriptMessages}
        sourceApp="matrx-frontend"
        sourceFeature="messages"
        // Seeds the engine at creation; `<MessagingArchiveKnob>` below owns
        // every later value of the same setting (see its comment).
        archiveFilter={archiveKnob}
        actions={actions}
        actionRenderers={MESSAGE_ACTION_SURFACES}
        // App chrome around the package's own surfaces: the data attributes the
        // v3 right-click menu resolves its target from, and this app's ONE
        // renderer for a ```matrx fence (the kind registry), so a reference in a
        // DM looks and behaves exactly as it does everywhere else.
        wrapMessage={MessagingMessageChrome}
        wrapConversationRow={MessagingConversationRowChrome}
        renderFence={MessagingFence}
        onOpenReference={onOpenReference}
        onIncomingMessage={onIncomingMessage}
        onDiagnostic={onDiagnostic}
        // Redux identity and the browser's Supabase session hydrate in separate
        // steps. Without this, a read that lands in between reports
        // `session-unavailable` instead of retrying once and recovering — which
        // is exactly the window that produced 909 captured errors in 0.6s.
        resolveSession={async () => {
          const { data } = await supabase.auth.getSession();
          setSessionUserId(data.session?.user.id ?? null);
          return data.session !== null;
        }}
      >
        <MessagingArchiveKnob knob={archiveKnob} />
        {children}
      </MessagingProvider>
    </MessagingAiDemandProvider>
  );
}

export default MessagingHost;

/**
 * THE LATE-KNOB PROBLEM, solved the way `AgentCatalogHost` solves it.
 *
 * `<MessagingProvider archiveFilter>` seeds the engine when the engine is
 * BUILT, and the user's preferences rehydrate from Redux on their own schedule
 * — often after that. Without this, a person whose setting says "show archived
 * by default" would silently get the platform default instead: a knob that
 * does nothing is the same defect as a dead control.
 *
 * So this reconciles. It applies the knob whenever it changes, but ONLY while
 * the filter is still exactly the value this component last put there (or the
 * package's own default, the first time). The moment a person moves the
 * control on a list, that choice owns the axis for the rest of the session and
 * this component stops touching it.
 *
 * It renders nothing. It must live INSIDE the provider because
 * `useConversations()` is where the package exposes the live axis.
 */
function MessagingArchiveKnob({ knob }: { knob: MessagingArchiveFilter }) {
  const host = useMessagingHost();
  const { archiveFilter, setArchiveFilter } = useConversations();
  const appliedRef = useRef<MessagingArchiveFilter | null>(null);
  const hostRef = useRef(host);
  const filterRef = useRef(archiveFilter);
  filterRef.current = archiveFilter;

  useEffect(() => {
    // No engine yet means `setArchiveFilter` is a no-op — recording the knob as
    // applied here would swallow it forever. Wait for the host.
    if (host === null) return;
    if (hostRef.current !== host) {
      // A new engine starts from the provider's own seed, so this component has
      // put nothing there yet.
      hostRef.current = host;
      appliedRef.current = null;
    }
    const untouched =
      appliedRef.current === null
        ? filterRef.current === knob || filterRef.current === "active"
        : filterRef.current === appliedRef.current;
    if (!untouched) return;
    appliedRef.current = knob;
    if (filterRef.current !== knob) setArchiveFilter(knob);
  }, [host, knob, setArchiveFilter]);

  return null;
}
