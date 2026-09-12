"use client";

/**
 * THE mount of the platform client-directive channel.
 *
 * One component, mounted once in `app/Providers.tsx`. It does exactly two
 * things and neither is feature-specific:
 *
 *  1. joins the two server-bus rooms this session listens on —
 *     `matrx-server-bus:<userId>` (this user) and `matrx-server-bus:platform`
 *     (everyone) — through `@ai-matrx/realtime`, whose room registry
 *     guarantees one underlying channel per topic per tab;
 *  2. fans every well-formed directive into the opt-in handler registry.
 *
 * It never publishes. The server is the only publisher (a Postgres trigger on
 * each settings table → aidream's wake listener → Supabase Broadcast), so a
 * write from this tab announces itself through the same door as any other.
 *
 * The platform-level handlers ship here because their consumers are
 * platform-level in this client: the feature-knob cache and the consent
 * toast. A FEATURE opts in from its own module with
 * `registerDirectiveHandler(...)` and never touches this file.
 *
 * Contract (cross-repo): common-docs/systems/platform/realtime/CLIENT-DIRECTIVES.md
 */

import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useChannel } from "@ai-matrx/realtime/react";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { invalidateFeatureKnobs } from "@/lib/knobs/featureKnobs";
import { notifyRefreshRequired } from "@/components/errors/refresh-directive";
import { serverBusChannelSpec } from "@/lib/client-directives/serverBusChannel";
import { PLATFORM_AUDIENCE } from "@/lib/client-directives/directiveEnvelope";
import {
  dispatchDirective,
  registerDirectiveHandler,
} from "@/lib/client-directives/directiveRegistry";

export function PlatformDirectiveSubscriber() {
  const userId = useSelector(selectUserId);

  // ── The platform handlers. Registered once, before the rooms connect, so a
  //    directive that lands on the first tick already has somewhere to go.
  useEffect(() => {
    const off = [
      registerDirectiveHandler("settings_changed", (payload) => {
        // The knob cache is TTL-only by design; this is the remote half its
        // own header called missing. Drop the window — the next read re-fetches
        // the registry from Postgres, which is the one authority.
        invalidateFeatureKnobs();
        console.info(
          `[client-directives] settings_changed → feature-knob cache invalidated ` +
            `(${payload.registry} ${payload.feature}.${payload.key}` +
            `${payload.scope ? ` @ ${payload.scope.kind}:${payload.scope.id}` : ""}).`,
        );
      }),
      registerDirectiveHandler("app_config_changed", (payload) => {
        // The web client does not consume its own app_config row yet (C1
        // census, 2026-09-10); the desktop client does. Logged so the
        // directive is visibly received, never silently dropped.
        console.info(
          `[client-directives] app_config_changed (${payload.app}) received; ` +
            `no web consumer of app_config is registered in this client.`,
        );
      }),
      registerDirectiveHandler("refresh_required", (payload) => {
        // ASK, never act. The consent toast owns the decision.
        notifyRefreshRequired({
          reason: payload.reason,
          title: payload.title,
          body: payload.body,
        });
      }),
    ];
    return () => off.forEach((fn) => fn());
  }, []);

  // Two rooms, one sink. `useChannel(null)` is the package's documented
  // "not yet" — a signed-out tab joins nothing.
  const userSpec = userId
    ? serverBusChannelSpec(userId, dispatchDirective)
    : null;
  const platformSpec = userId
    ? serverBusChannelSpec(PLATFORM_AUDIENCE, dispatchDirective)
    : null;
  useChannel(userSpec);
  useChannel(platformSpec);

  return null;
}
