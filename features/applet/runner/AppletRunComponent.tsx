"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAppletRuntimeBySlug,
  selectAppletRuntimeActiveAppletId,
  setActiveAppletId,
  selectAppletIdBySlug,
  selectAppletRuntimeIsInitialized,
} from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { selectAppRuntimeIsInitialized } from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { LoadingSpinner } from "@/components/ui/spinner";
import AppletLayoutManager from "@/features/applet/runner/layouts/AppletLayoutManager";
import useAppletRecipe from "@/features/applet/hooks/useAppletRecipe";
import useAppletRecipeFastAPI from "@/features/applet/hooks/useAppletRecipeFastAPI";
import ResponseLayoutManager from "@/features/applet/runner/response/ResponseLayoutManager";
import AppletFollowUpInput, {
  FollowUpTurn,
} from "@/features/applet/runner/response/AppletFollowUpInput";
import MarkdownStream from "@/components/MarkdownStream";
import PreviewLoadingWithMessage from "@/features/applet/builder/previews/PreviewLoadingWithMessage";
import { AppletLayoutOption } from "@/types/customAppTypes";
import { useToastManager } from "@/hooks/useToastManager";
import { Construction } from "lucide-react";

/**
 * TEMPORARY — applet execution is under construction.
 *
 * The applet runner used to execute via the prompts system (recipe → prompt
 * conversion + Socket.IO transport). Both paths were retired with the prompts
 * removal and will be rebuilt on the agents execution system. Until then we
 * keep the entire applet subsystem WIRED AND RENDERED (so nothing gets
 * orphaned/forgotten and accidentally deleted) but disable the execution side
 * effects and show an under-construction notice at the submit boundary.
 *
 * To resurrect: flip this to `false`, finish the agent-execution rewire in
 * useAppletRecipeFastAPI (restore the recipe→agent path) and re-test.
 */
const APPLET_EXECUTION_UNDER_CONSTRUCTION = true;

const SLUG_TO_COORDINATOR_MAP = {
  "core-info-generator": "app_suggestions",
  "applet-description-generator": "app_suggestions",
  "candidate-write-up-not-used": "candidate_profile_structured",
  "interview-transcript-analyzer": "modern_candidate_profile",
  "lsi-variations": "keyword_hierarchy",
};

const ALLOW_EDITING = true;

interface AppletRunComponentProps {
  appSlug: string;
  appletSlug: string;
  layoutTypeOverride?: AppletLayoutOption;
  isPreview?: boolean;
  allowSubmit?: boolean;
  isFullScreenPreview?: boolean;
  responseLayoutTypeOverride?: AppletLayoutOption;
  coordinatorOverride?: string;
  /** When true, routes execution through FastAPI agent endpoint instead of Socket.IO (?fx=1) */
  useFastApi?: boolean;
}

export default function AppletRunComponent({
  appSlug,
  appletSlug,
  layoutTypeOverride,
  isPreview,
  allowSubmit = true,
  isFullScreenPreview = false,
  responseLayoutTypeOverride = "flat-accordion",
  coordinatorOverride = "default",
  useFastApi = false,
}: AppletRunComponentProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();

  const isAppInitialized = useAppSelector(selectAppRuntimeIsInitialized);
  const isAppletInitialized = useAppSelector(selectAppletRuntimeIsInitialized);
  const applet = useAppSelector((state) =>
    selectAppletRuntimeBySlug(state, appletSlug),
  );
  const appletId = useAppSelector((state) =>
    selectAppletIdBySlug(state, appletSlug),
  );
  const activeAppletId = useAppSelector(selectAppletRuntimeActiveAppletId);
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [socketTaskId, setSocketTaskId] = useState<string | null>(null);
  const [followUpTurns, setFollowUpTurns] = useState<FollowUpTurn[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const toast = useToastManager();

  // Both hooks are always called (React rules — no conditional hooks).
  // Only the result from the active path is used.
  // `enabled: false` while under construction short-circuits all execution side
  // effects (socket task creation + the removed recipe→agent conversion fetch)
  // without unwiring the hooks/components.
  const socketResult = useAppletRecipe({
    appletId,
    enabled: !APPLET_EXECUTION_UNDER_CONSTRUCTION,
  });
  const fastApiResult = useAppletRecipeFastAPI({
    appletId,
    enabled: !APPLET_EXECUTION_UNDER_CONSTRUCTION,
  });

  // Auto-enable FastAPI path when the applet has a cached agent ID (promptId),
  // or when ?fx=1 is explicitly set. Falls back to Socket.IO otherwise.
  const isFastApiPath = useFastApi || fastApiResult.hasAgent;

  const activeResult = isFastApiPath ? fastApiResult : socketResult;
  const { taskId, submitRecipe } = activeResult;
  const conversationId = isFastApiPath
    ? fastApiResult.conversationId
    : undefined;

  // Show the fixed bottom bar when FastAPI path is active and task has been submitted
  const showFollowUpBar = isFastApiPath && taskSubmitted;

  const handleNewTurn = useCallback((turn: FollowUpTurn) => {
    setFollowUpTurns((prev) => [...prev, turn]);
    // Scroll to bottom after a tick so the new turn is in the DOM
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  const coordinatorId = SLUG_TO_COORDINATOR_MAP[appletSlug] || "default";

  useEffect(() => {
    if (taskId) {
      setSocketTaskId(taskId);
    }
  }, [taskId]);

  // Persist conversationId in the URL (?cid=...) so the user can refresh without losing context.
  // We read current URL params from window.location to avoid depending on useSearchParams
  // (which would require an additional Suspense boundary in this component tree).
  useEffect(() => {
    if (!isFastApiPath || !conversationId) return;
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(window.location.search).get("cid");
    if (current === conversationId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("cid", conversationId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [conversationId, useFastApi, router, pathname]);

  const handleSubmit = () => {
    if (APPLET_EXECUTION_UNDER_CONSTRUCTION) {
      toast.info(
        "Applet execution is temporarily under construction and will be back soon.",
      );
      return;
    }
    if (socketTaskId) {
      if (!allowSubmit) {
        console.log("In the current mode, Submit is not available.");
        toast.info(
          "In the current mode, 'Submit' is not available. Please run your applet to test full functionality",
        );
        return;
      }
      submitRecipe();
      setTaskSubmitted(true);
    }
  };

  // Set as active applet if not already active
  useEffect(() => {
    if (isAppInitialized && applet && activeAppletId !== applet.id) {
      dispatch(setActiveAppletId(applet.id));
    }
  }, [dispatch, isAppInitialized, applet, activeAppletId]);

  // Show loading state until app is initialized and applet data is available
  const isLoading =
    !isAppInitialized || !isAppletInitialized || !applet || !appletId;

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        {isPreview ? (
          <PreviewLoadingWithMessage
            isLoading={isLoading}
            isPreview={!!isPreview}
          />
        ) : (
          <LoadingSpinner />
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <PreviewLoadingWithMessage
        isLoading={isLoading}
        isPreview={!!isPreview}
      />

      {/* Scrollable content area — grows to fill space above the follow-up bar */}
      <div
        ref={scrollAreaRef}
        className={`flex-1 overflow-y-auto scrollbar-none ${showFollowUpBar ? "pb-[50dvh]" : ""}`}
      >
        {APPLET_EXECUTION_UNDER_CONSTRUCTION && (
          <div className="w-full max-w-4xl mx-auto px-4 pt-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <Construction className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">
                  Applet execution is temporarily under construction
                </p>
                <p className="text-muted-foreground">
                  You can still explore and edit this applet. Running it is
                  disabled while we rebuild execution on the agents system — it
                  will be back soon.
                </p>
              </div>
            </div>
          </div>
        )}
        {!taskSubmitted && (
          <>
            {isPreview && <div className="py-4"></div>}
            <AppletLayoutManager
              appSlug={appSlug}
              appletId={appletId}
              handleSubmit={handleSubmit}
              layoutTypeOverride={layoutTypeOverride}
              isPreview={isPreview}
            />
          </>
        )}
        {taskSubmitted && taskId && (
          <ResponseLayoutManager
            appSlug={appSlug}
            appletId={appletId}
            taskId={taskId}
            handleSubmit={handleSubmit}
            coordinatorId={coordinatorId}
            isPreview={isPreview}
            responseLayoutTypeOverride={responseLayoutTypeOverride}
            allowEditing={ALLOW_EDITING}
          />
        )}

        {/* Follow-up turns — rendered in the scroll area so they flow naturally above the fixed bar */}
        {followUpTurns.length > 0 && (
          <div className="w-full max-w-4xl mx-auto px-4 space-y-4 pt-4">
            {followUpTurns.map((turn) => (
              <div key={turn.taskId} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {turn.userMessage}
                  </div>
                </div>
                <MarkdownStream
                  taskId={turn.taskId}
                  className="bg-textured"
                  hideCopyButton={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom follow-up bar — sits outside the scroll area, like chat pages */}
      {showFollowUpBar && (
        <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 pb-safe">
          <div className="w-full max-w-4xl mx-auto">
            <AppletFollowUpInput
              conversationId={conversationId}
              onNewTurn={handleNewTurn}
            />
          </div>
        </div>
      )}
    </div>
  );
}
