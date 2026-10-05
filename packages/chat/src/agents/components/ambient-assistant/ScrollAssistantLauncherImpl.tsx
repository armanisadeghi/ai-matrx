"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "../../../host/navigation";
import { X } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { SmartAgentInput } from "../inputs/smart-input/SmartAgentInput";
import type { ComposerPresentation } from "../inputs/smart-input/composer/composer-types";

/** The page launcher is the composer's `launcher` style: text · mic · send. */
const LAUNCHER_COMPOSER: ComposerPresentation = { size: "launcher", mode: "chat" };
import {
  ambientAssistantMandateChain,
  ambientPageGuidanceValues,
  type AmbientAssistantMandateChain,
} from "./ambientAssistantMandates";
import { useAgentLauncher } from "../../hooks/useAgentLauncher";
import { useMandateChain } from "../../../mandates/useMandateChain";
import { selectSubmissionPhase } from "../../redux/execution-system/instance-user-input/instance-user-input.selectors";
import { sourceFeatureFromSurfaceName } from "../../utils/source-feature-from-surface";
import { useOpenQuickChatSheet } from "../../../host/window-openers";
import { useAuthGuardedAction } from "@ai-matrx/chat/host/ui-slots";
import { useSurfaceRuntime } from "../../../surfaces/runtime/SurfaceRuntimeContext";
import { useAppSelector } from "../../../store/hooks";
import { CHAT_WINDOWS } from "../../../host/windows";
import { useIsChatWindowOpen } from "../../../host/windows-react";
import { cn } from "@ai-matrx/design-system";
import { IntelligenceIndicator } from "../../../surfaces/runtime/intelligence";
import { OrganizationContextNotice } from "@ai-matrx/chat/host/ui-slots";
import { useOrganizationRequired } from "@ai-matrx/chat/host/ui-slots";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";
import { selectIsAuthenticated } from "../../../host/identity";
import { selectOrganizationId } from "../../../host/org";

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
        variant="quiet"
        className="pointer-events-auto w-full justify-start"
        onClick={requestSignIn}
      >
        Ask AI Matrx
      </Button>
      <Button
        icon={<X />}
        type="button"
        variant="quiet"
        className="pointer-events-auto absolute -right-2 -top-2"
        onClick={onDismiss}
        aria-label="Dismiss assistant until refresh"
      />
    </div>
  );
}

function AuthenticatedAmbientAssistant({
  inputVariant = "single-line",
  onRetry,
}: ScrollAssistantLauncherImplProps & { onRetry: () => void }) {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const chain: AmbientAssistantMandateChain =
    ambientAssistantMandateChain(pathname);
  // Rung by rung, so each key's type is visible where it is handed over.
  const { mandate, mandateKey, loading, error, organizationPending } =
    useMandateChain({
      system: chain.system,
      module: chain.module,
      page: chain.page,
    });
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
    // Wait for the whole page → module → system chain: while an override is
    // still loading the answering rung (and so `mandateKey`) can change, and a
    // key change relaunches the managed conversation under the same id — the
    // superseded launch's cleanup then reaps the new one and Send does nothing.
    ready: Boolean(mandate) && !loading && !dismissed,
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
  const quickChatOpen = useIsChatWindowOpen(CHAT_WINDOWS.quickChat);

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
              className="shrink-0"
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
            composer={LAUNCHER_COMPOSER}
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
        icon={<X />}
        type="button"
        variant="quiet"
        className="pointer-events-auto absolute -right-2 -top-2 z-10"
        onClick={dismiss}
        aria-label="Dismiss assistant until refresh"
        title="Dismiss until refresh"
      />
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
