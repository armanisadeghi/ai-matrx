"use client";

// features/connectors/ConnectorPromptCard.tsx
//
// THE FIRST MOMENT — the dismissible card that offers a provider, before the
// person has connected anything. Generic: it renders whatever
// `ConnectorProviderConfig` it is handed, and Google is only the first one.
//
// Champion (PLAN §1, "First Google moment"): the ChatGPT/Codex connectors card.
// We match its three beats — one card in the chat area, one sentence, one
// button, one dismiss — and beat it on two things the champion does not do:
//   • it never returns on its own after a dismissal (`connectors.prompt
//     .resurface_days`, default 0 = never), because a prompt that keeps coming
//     back is an ad;
//   • the dismissal is the PERSON's, stored as a user preference, so "not now"
//     on a laptop is "not now" on a phone.
//
// 🚨 It is a normal block ABOVE `ConnectorStrip`, never inside it. The strip is
// one 16px line under a composer and its geometry is load-bearing (see
// `ConnectorStrip.tsx`); putting a card in it would double the composer's
// vertical footprint on every surface that mounts it.

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { ConnectorMark } from "./ConnectorMark";
import { getConnector } from "./registry";
import type { ConnectorProviderConfig } from "./provider-config";

export const CONNECTOR_PROMPT_RESURFACE_KNOB = "connectors.prompt.resurface_days";

function daysSince(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return (now - at) / 86_400_000;
}

/**
 * Should the card be on screen? Pure, so the rule is testable and identical
 * wherever the card mounts.
 *
 * `resurfaceDays` is `undefined` while the knob is still resolving — and an
 * unresolved knob never resurfaces a card the person dismissed.
 */
export function shouldShowConnectorPrompt({
  connected,
  dismissedAt,
  resurfaceDays,
  now,
}: {
  connected: boolean;
  dismissedAt: string | null;
  resurfaceDays: number | undefined;
  now: number;
}): boolean {
  if (connected) return false;
  if (!dismissedAt) return true;
  if (!resurfaceDays || resurfaceDays <= 0) return false;
  return daysSince(dismissedAt, now) >= resurfaceDays;
}

export interface ConnectorPromptCardProps {
  provider: ConnectorProviderConfig;
  /** True when any of the provider's products is live for this person. */
  connected: boolean;
  /** Suppress the card while we do not yet know whether it is connected. */
  loading?: boolean;
  onConnect: () => void;
  /** `page` drops the card's own frame for a surface that supplies one. */
  variant?: "card" | "bare";
  className?: string;
}

export function ConnectorPromptCard({
  provider,
  connected,
  loading = false,
  onConnect,
  variant = "card",
  className,
}: ConnectorPromptCardProps) {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const [dismissals, setDismissals] = useSetting<Record<string, string>>(
    "userPreferences.connectors.promptDismissedAt",
  );
  const resurface = useEffectiveKnob(
    organizationId,
    userId,
    CONNECTOR_PROMPT_RESURFACE_KNOB,
  );

  const dismissedAt = dismissals?.[provider.id] ?? null;
  const show = shouldShowConnectorPrompt({
    connected,
    dismissedAt,
    resurfaceDays: typeof resurface === "number" ? resurface : undefined,
    now: Date.now(),
  });

  // A card that flashes "connect Google" at someone who already has it is worse
  // than a beat of silence, so nothing renders until the answer is known.
  if (loading || !show) return null;

  const connector = getConnector(provider.markConnectorId);

  const dismiss = () => {
    setDismissals({
      ...(dismissals ?? {}),
      [provider.id]: new Date().toISOString(),
    });
  };

  return (
    <section
      aria-label={provider.prompt.title}
      className={cn(
        "relative w-full text-left",
        variant === "card" &&
          "rounded-xl border border-border bg-card p-3 sm:p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] dark:shadow-none",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15">
          {connector ? (
            <ConnectorMark connector={connector} className="h-5 w-5" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="pr-7 text-sm font-semibold text-foreground">
            {provider.prompt.title}
          </h3>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {provider.prompt.body}
          </p>
          <div className="mt-2.5">
            <Button
              size="sm"
              onClick={onConnect}
              className="h-11 w-full text-sm sm:h-8 sm:w-auto"
            >
              {provider.prompt.cta}
            </Button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss the ${provider.name} suggestion`}
        title={`Dismiss — ${provider.name} stays available in Settings → Connectors`}
        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:h-7 sm:w-7"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
