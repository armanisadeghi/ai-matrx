"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { ambientAssistantMandateChain } from "./ambientAssistantMandates";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useMandateChain } from "@/features/agents/mandates/useMandateChain";
import { selectSubmissionPhase } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useOpenQuickChatSheet } from "@/features/overlays/openers/quickChat";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

export interface ScrollAssistantLauncherImplProps {
  inputVariant?: "single-line" | "multiline";
}

/**
 * The live half of the scroll assistant. It creates one ordinary managed chat
 * conversation, lets the canonical SmartAgentInput own the draft/submit, and
 * hands that same conversation to Quick Chat when the first turn is accepted.
 */
export default function ScrollAssistantLauncherImpl({
  inputVariant = "single-line",
}: ScrollAssistantLauncherImplProps) {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const { mandate, loading, error } = useMandateChain(
    ambientAssistantMandateChain(pathname),
  );
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
    ready: Boolean(mandate) && !dismissed,
    retainOnUnmount: true,
    preferFresh: true,
    config: {
      allowChat: true,
      responseDensity: "compact",
    },
  });
  const submissionPhase = useAppSelector(
    selectSubmissionPhase(conversationId ?? ""),
  );

  useEffect(() => {
    if (
      !conversationId ||
      submissionPhase !== "pending" ||
      openedConversationRef.current === conversationId
    ) {
      return;
    }
    openedConversationRef.current = conversationId;
    openQuickChat({
      initialConversationId: conversationId,
      title: "Assistant",
    });
    setDismissed(true);
  }, [conversationId, openQuickChat, submissionPhase]);

  if (dismissed) return null;

  const dismiss = () => {
    if (conversationId) close(conversationId);
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-5 left-1/2 z-[35] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200",
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
        ) : error || !mandate ? (
          <div
            className={cn(
              "flex items-center rounded-xl bg-card/80 px-3 text-xs text-muted-foreground shadow-sm backdrop-blur-md",
              inputVariant === "multiline" ? "h-[72px]" : "h-9",
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              Assistant unavailable
            </span>
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
            showConnectors={false}
            enablePasteImages={false}
          />
        )}
      </div>
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
