"use client";

/**
 * /messenger/agents — `@ai-matrx/chat`'s messenger shell over the AGENTS source
 * ("agents you know"): a short roster the person controls, pinned threads as
 * rows, and THE chat room as the thread body.
 *
 * Everything is the package's (roster, menus, dropdown, Manage, details, room).
 * This file hands in only the app's own pieces: the profile, the deep link
 * (`?agent=&thread=`, mirrored with replaceState — never a navigation), and
 * the Chief of Staff seat's ONE staff thread, which opens through the SAME
 * door /staff uses (`StaffRoom`), never a second staff thread.
 */

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgentsMessenger } from "@ai-matrx/chat/messenger/agents/AgentsMessenger";
import type { AgentsMessengerLocation } from "@ai-matrx/chat/messenger/agents/AgentsMessenger";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName, selectUserAvatarUrl } from "@/lib/redux/selectors/userSelectors";
import { StaffRoom } from "@/features/personal-staff/components/StaffRoom";
import { MESSENGER_AGENTS_HREF } from "./messenger-route";

export interface MessengerAgentsRouteProps {
  readonly initialLocation?: AgentsMessengerLocation;
}

function messengerAgentsHref(location: AgentsMessengerLocation): string {
  const params = new URLSearchParams();
  if (location.agentId) params.set("agent", location.agentId);
  if (location.conversationId) params.set("thread", location.conversationId);
  const query = params.toString();
  return query ? `${MESSENGER_AGENTS_HREF}?${query}` : MESSENGER_AGENTS_HREF;
}

export function MessengerAgentsRoute({ initialLocation }: MessengerAgentsRouteProps) {
  const router = useRouter();
  const name = useAppSelector(selectDisplayName);
  const avatarUrl = useAppSelector(selectUserAvatarUrl);

  const profile = useMemo(
    () => ({
      name: name || "You",
      avatar: avatarUrl ? ({ kind: "image", src: avatarUrl } as const) : ({ kind: "monogram" } as const),
      onSelect: () => router.push("/settings/profile"),
    }),
    [name, avatarUrl, router],
  );

  // The URL follows the person (shareable, refresh-safe) without a navigation.
  const onLocationChange = useCallback((location: AgentsMessengerLocation) => {
    const next = messengerAgentsHref(location);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, []);

  const linkTo = useCallback(
    (location: AgentsMessengerLocation) => `${window.location.origin}${messengerAgentsHref(location)}`,
    [],
  );

  const renderSeatRoom = useCallback(
    ({ mandateKey, agentId }: { mandateKey: string; agentId: string }) =>
      mandateKey === MANDATE_KEYS.personal_staff__front_line ? <StaffRoom seedAgentId={agentId} embedded /> : null,
    [],
  );

  return (
    <AgentsMessenger
      profile={profile}
      initialLocation={initialLocation}
      onLocationChange={onLocationChange}
      linkTo={linkTo}
      renderSeatRoom={renderSeatRoom}
    />
  );
}
