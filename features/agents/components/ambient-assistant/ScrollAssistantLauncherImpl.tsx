"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import {
  ambientAssistantMandateChain,
  ambientPageGuidanceValues,
} from "./ambientAssistantMandates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useMandateChain } from "@/features/mandates/useMandateChain";
import { selectSubmissionPhase } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useOpenQuickChatSheet } from "@/features/overlays/openers/quickChat";
import { useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { cn } from "@/lib/utils";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ScrollAssistantLauncherImplProps {
  inputVariant?: "single-line" | "multiline";
}

/**
 * The live half of the scroll assistant. It creates one ordinary managed chat
 * conversation, lets the canonical SmartAgentInput own the draft/submit, and
 * hands that same conversation to Quick Chat when the first turn is accepted.
 */
function GuestAmbientAssistant({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const requestSignIn = useAuthGuardedAction(() => undefined, {
    featureName: "AI Matrx assistant",
    featureDescription:
      "Sign in to ask the AI Matrx assistant about the page you are viewing.",
  });

  return (
    <div className="ambient-assistant-dock fixed left-1/2 z-[35] w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <Button
        type="button"
        variant="ghost"
        className="pointer-events-auto h-9 w-full justify-start rounded-xl border border-border bg-glass px-4 text-sm text-muted-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass hover:bg-glass-hover hover:text-foreground"
        onClick={requestSignIn}
      >
        Ask AI Matrx
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="pointer-events-auto absolute -right-2 -top-2 h-7 w-7 rounded-full border border-glass-edge bg-card shadow-glass"
        onClick={onDismiss}
        aria-label="Dismiss assistant until refresh"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AuthenticatedAmbientAssistant({
  inputVariant = "single-line",
  onRetry,
}: ScrollAssistantLauncherImplProps & { onRetry: () => void }) {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const chain = ambientAssistantMandateChain(pathname);
  const { mandate, mandateKey, loading, error, organizationPending } =
    useMandateChain(chain);
  const organizationId = useAppSelector(selectOrganizationId);
  // Pending on an organization says which of the states it is: still
  // resolving, none chosen, or the read failed — never "choose" during a race.
  const { organizationState, retry: retryOrganization } = useOrganizationRequired();
  const [dismissed, setDismissed] = useState(false);
  const openedConversationRef = useRef<string | null>(null);
  const openQuickChat = useOpenQuickChatSheet();

  const routeSlug = pathname.split("/").filter(Boolean)[0] ?? "chat";
  const sourceFeature =
    sourceFeatureFromSurfaceName(runtime?.surfaceName) ??
    sourceFeatureFromSurfaceName(`matrx-user/${routeSlug}`) ??
    "chat";
  const surfaceKey = `ambient-assistant:${pathname}`;
  const { conversationId, close } = useAgentLauncher(mandate?.agentId ?? "", {
    surfaceKey,
    sourceFeature,
    // THE MANDATE DOOR: the run goes to `/ai/mandates/{key}` for the rung that
    // answered, so the page facts below reach a binding's consumption map.
    // `agentId` still paints the input bar from the chain's own resolution.
    mandateKey,
    ready: Boolean(mandate) && !dismissed,
    retainOnUnmount: true,
    preferFresh: true,
    config: {
      allowChat: true,
      responseDensity: "compact",
    },
    runtime: {
      variables: ambientPageGuidanceValues({
        pathname,
        chain,
        resolvedKey: mandateKey,
        surfaceName: runtime?.surfaceName,
        sourceFeature,
        organizationId,
      }),
    },
  });
  const submissionPhase = useAppSelector(
    selectSubmissionPhase(conversationId ?? ""),
  );
  const quickChatOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "quickChat"),
  );

  useEffect(() => {
    if (submissionPhase !== "pending") openedConversationRef.current = null;
  }, [submissionPhase]);

  useEffect(() => {
    if (
      !conversationId ||
      submissionPhase !== "pending" ||
      openedConversationRef.current === conversationId
    ) {
      return;
    }
    openedConversationRef.current = conversationId;
    if (quickChatOpen) return;
    openQuickChat({
      initialConversationId: conversationId,
      title: "Assistant",
    });
  }, [conversationId, openQuickChat, quickChatOpen, submissionPhase]);

  if (dismissed || quickChatOpen) return null;

  const dismiss = () => {
    if (conversationId) close(conversationId);
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "ambient-assistant-dock fixed left-1/2 z-[35] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200",
        inputVariant === "multiline"
          ? "w-[min(420px,calc(100vw-2rem))]"
          : "w-[min(380px,calc(100vw-2rem))]",
      )}
    >
      <div className="pointer-events-auto opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100">
        {loading ? (
          <div
            className={cn(
              "animate-pulse bg-glass shadow-glass backdrop-blur-glass",
              inputVariant === "multiline"
                ? "h-[72px] rounded-[20px]"
                : "h-9 rounded-xl",
            )}
          />
        ) : organizationPending ? (
          // Never a dead pill (page-pass 2026-09-27): no organization yet is
          // a wait with a remedy, in place.
          <OrganizationContextNotice
            state={organizationState === "ready" ? "resolving" : organizationState}
            onRetry={retryOrganization}
            compact
            what="The page assistant"
            description="Pick the organization you are working in and it is ready."
            className="rounded-xl border border-border bg-card shadow-sm"
          />
        ) : error || !mandate ? (
          <div
            role="alert"
            className={cn(
              "flex items-center gap-2 rounded-xl bg-card/90 py-1 pl-3 pr-1 text-xs text-muted-foreground shadow-sm backdrop-blur-md",
              inputVariant === "multiline" ? "min-h-[72px]" : "min-h-9",
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              The page assistant didn&apos;t load{error ? ` — ${error}` : "."}
              <ErrorAlchemyMenu error={error ?? "The page assistant didn't load"} operation="Load the page assistant" />
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={onRetry}
            >
              Try again
            </Button>
          </div>
        ) : !conversationId ? (
          <div
            className={cn(
              "animate-pulse bg-glass shadow-glass backdrop-blur-glass",
              inputVariant === "multiline"
                ? "h-[72px] rounded-[20px]"
                : "h-9 rounded-xl",
            )}
          />
        ) : (
          <SmartAgentInput
            conversationId={conversationId}
            presentation="ambient"
            ambientLayout={inputVariant}
            surfaceKey={surfaceKey}
            enablePasteImages={false}
          />
        )}
      </div>
      {conversationId && mandate && (
        <IntelligenceIndicator
          feature="ambient"
          label="The page assistant"
          className="pointer-events-auto absolute -left-2 -top-2 z-10 bg-card/95 shadow-glass backdrop-blur-glass"
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="pointer-events-auto absolute -right-2 -top-2 z-10 h-7 w-7 rounded-full border border-glass-edge bg-card/95 text-muted-foreground opacity-80 shadow-glass backdrop-blur-glass transition-[color,opacity,transform] hover:scale-105 hover:bg-card hover:text-foreground hover:opacity-100"
        onClick={dismiss}
        aria-label="Dismiss assistant until refresh"
        title="Dismiss until refresh"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function ScrollAssistantLauncherImpl(
  props: ScrollAssistantLauncherImplProps,
) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [dismissed, setDismissed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (dismissed) return null;
  if (!isAuthenticated) {
    return <GuestAmbientAssistant onDismiss={() => setDismissed(true)} />;
  }
  return (
    <AuthenticatedAmbientAssistant
      key={attempt}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
