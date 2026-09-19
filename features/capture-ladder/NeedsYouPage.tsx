"use client";

/**
 * features/capture-ladder/NeedsYouPage.tsx — the body of `/capture/needs-you`.
 *
 * The full list, and the ONE button that acts on it. The ambient notice lives
 * in the assists dock (`needsYouAssist.ts`); this is the door behind it, for
 * someone who wants to see every page rather than a count.
 *
 * Header conformance (core-route-headers): identity and the one action live in
 * the shell's center zone via `RouteHeader`; the body is `h-full
 * overflow-hidden` with its own scroll container and NO header-height math and
 * NO in-body title bar.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, MonitorSmartphone, Puzzle } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  ChevronLeftTapButton,
  RefreshCwTapButton,
} from "@ai-matrx/tap-target/buttons";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { NeedsYouList } from "@/features/capture-ladder/NeedsYouList";
import { useNeedsYou } from "@/features/capture-ladder/useNeedsYou";
import {
  countNeedsYouElsewhere,
  elsewhereSentence as describeElsewhere,
} from "@/features/capture-ladder/captureHandoffTable";
import { EXTENSION_SETUP_ROUTE } from "@/features/capture-ladder/needsYouAssist";
import {
  handToOwnBrowser,
  hasOwnBrowserExtension,
} from "@/lib/extension-bridge/handToOwnBrowser";

/**
 * The action bar. One button, one sentence, and the sentence says what the
 * button does — not what the page is (owner, 2026-09-18: *"I still don't know
 * what it wants me to do"*).
 *
 * 🚨 It asks whether the extension is there BEFORE offering the button that
 * needs it. A primary action that fails on click because a prerequisite is
 * missing is a screen lying about what it can do; the button simply becomes the
 * other button, and says so.
 */
function NeedsYouAction({
  organizationId,
  firstHandoffId,
  firstUrl,
  onDone,
}: {
  organizationId: string | null;
  firstHandoffId: string | undefined;
  firstUrl: string | undefined;
  onDone: () => void;
}) {
  const [extension, setExtension] = useState<"checking" | "yes" | "no">(
    "checking",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void hasOwnBrowserExtension().then((found) => {
      if (alive) setExtension(found ? "yes" : "no");
    });
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!organizationId || busy) return;
    setBusy(true);
    try {
      const outcome = await handToOwnBrowser({
        organizationId,
        handoffId: firstHandoffId,
        url: firstUrl,
      });
      if (outcome.kind === "handed_over") {
        toast.success(outcome.sentence);
        onDone();
        return;
      }
      if (outcome.kind === "no_extension") {
        // It was there when the page loaded and is not now. Say that, and turn
        // the button into the one that still works.
        setExtension("no");
        toast.error(outcome.sentence);
        return;
      }
      toast.error(outcome.sentence);
    } finally {
      setBusy(false);
    }
  }, [organizationId, firstHandoffId, firstUrl, busy, onDone]);

  if (extension === "no") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:gap-3">
        <Button asChild size="sm" className="gap-1.5 self-start sm:self-auto">
          <a href={EXTENSION_SETUP_ROUTE}>
            <Puzzle className="h-3.5 w-3.5" />
            Add the extension
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          These pages need a browser that is already signed in — yours. The
          Matrx extension is what lets it read them for you, and it is not
          installed here yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:gap-3">
      <Button
        size="sm"
        onClick={() => void run()}
        disabled={busy || extension === "checking" || !organizationId}
        className="gap-1.5 self-start sm:self-auto"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MonitorSmartphone className="h-3.5 w-3.5" />
        )}
        Open in my browser
      </Button>
      <p className="text-xs text-muted-foreground">
        Your own Chrome opens these in the background, reads them, and files the
        text in your library. You do not have to visit them yourself.
      </p>
    </div>
  );
}

export function NeedsYouPage() {
  const {
    state,
    handoffs,
    refresh,
    livenessSentence,
    droppedSentence,
  } = useNeedsYou();
  const organizationId = useAppSelector(selectOrganizationId);
  const organizationName = useAppSelector(selectOrganizationName);
  const [elsewhere, setElsewhere] = useState<string | null>(null);

  // Only worth asking once the queue here is known. It is a second round trip
  // and its whole job is to stop an empty list from being ambiguous.
  useEffect(() => {
    if (state.kind !== "ready") return;
    let alive = true;
    void countNeedsYouElsewhere(organizationId).then((result) => {
      if (alive) setElsewhere(describeElsewhere(result));
    });
    return () => {
      alive = false;
    };
  }, [state.kind, organizationId, handoffs.length]);

  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              href="/scraper/batch"
              variant="transparent"
              ariaLabel="Back to batch reading"
            />
            <h1 className="ml-2 min-w-0 truncate text-sm font-medium text-foreground">
              Needs your browser
            </h1>
          </div>
        }
        right={
          <RefreshCwTapButton
            ariaLabel="Check again"
            onClick={() => refresh()}
          />
        }
      />
      {/* 🚨 `pt-[var(--shell-header-h)]` is the RouteHeader contract, not decoration:
          the shell header is TRANSPARENT and the body flows under it, so a page
          without this padding renders its first ~48px behind the header. This
          route shipped without it and the cost was recorded as cosmetic ("the
          tray's intro line scrolls out of view at 1440", STATE.md) — until the
          page grew a primary button, which then sat half-hidden behind the
          header. Nothing else on this screen matters if the button is the thing
          that disappears. */}
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <div className="h-full overflow-y-auto px-3 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {handoffs.length > 0 && organizationName && (
              // 🚨 A list that does not name its workspace is half a sentence.
              // The rows here are ONE workspace's; the notice below says what
              // is waiting in the others. Without this line the person cannot
              // tell which half they are reading (found on an independent walk).
              <p className="text-xs text-muted-foreground">
                Waiting in <span className="font-medium text-foreground">{organizationName}</span>
              </p>
            )}
            {handoffs.length > 0 && (
              <NeedsYouAction
                organizationId={organizationId}
                firstHandoffId={handoffs[0]?.id}
                firstUrl={handoffs[0]?.url}
                onDone={refresh}
              />
            )}
            <NeedsYouList
              state={state}
              handoffs={handoffs}
              livenessSentence={livenessSentence}
              droppedSentence={droppedSentence}
              elsewhereSentence={elsewhere}
              organizationName={organizationName}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default NeedsYouPage;
