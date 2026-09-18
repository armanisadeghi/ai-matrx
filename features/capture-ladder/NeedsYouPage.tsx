"use client";

/**
 * features/capture-ladder/NeedsYouPage.tsx — the body of `/capture/needs-you`.
 *
 * Header conformance (core-route-headers): identity and the one action live in
 * the shell's center zone via `RouteHeader`; the body is `h-full
 * overflow-hidden` with its own scroll container and NO header-height math and
 * NO in-body title bar.
 */

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  ChevronLeftTapButton,
  RefreshCwTapButton,
} from "@ai-matrx/tap-target/buttons";
import { NeedsYouList } from "@/features/capture-ladder/NeedsYouList";
import { useNeedsYou } from "@/features/capture-ladder/useNeedsYou";

export function NeedsYouPage() {
  const { state, handoffs, refresh, livenessSentence, droppedSentence } =
    useNeedsYou();

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
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto px-3 py-4">
          <div className="mx-auto max-w-3xl">
            <NeedsYouList
              state={state}
              handoffs={handoffs}
              livenessSentence={livenessSentence}
              droppedSentence={droppedSentence}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default NeedsYouPage;
