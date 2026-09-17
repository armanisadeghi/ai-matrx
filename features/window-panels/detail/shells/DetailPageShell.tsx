// features/window-panels/detail/shells/DetailPageShell.tsx
//
// The PAGE shell for the Detail primitive: a `(core)` route body under the
// shell header — `RouteHeader` (back chevron + the record's title on the
// left, the presentation switcher on the right) and a single scroll area
// that reserves the transparent header's height. Light: no `WindowPanel`.

"use client";

import { useRef } from "react";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import type { DetailPageShellProps } from "@ai-matrx/detail/react";

export function DetailPageShell({
  titleNode,
  actions,
  onBack,
  children,
}: DetailPageShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "detail page body" });
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 flex-1 items-center gap-0 p-0">
            <ChevronLeftTapButton onClick={onBack} ariaLabel="Back" tooltip="Back" />
            {/* D2: at 390px a 40vw cap left 156px for the name and it vanished
                behind the icon and the chip. The title takes the row it has and
                truncates; the chip and the id stepped out of the bar entirely
                (they are in the body's meta line). */}
            <div className="min-w-0 flex-1 sm:max-w-[48vw]">{titleNode}</div>
          </div>
        }
        right={actions}
      />
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto pt-[var(--shell-header-h)] pb-safe"
        >
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-2 sm:px-4">
            <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
