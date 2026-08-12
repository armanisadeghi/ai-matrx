"use client";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export function ProviderConversationHeader({ title }: { title: string }) {
  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            href="/work/conversations"
            ariaLabel="Back to provider conversations"
          />
          <span className="ml-1 max-w-[min(44vw,32rem)] truncate text-sm font-medium text-foreground">
            {title}
          </span>
        </>
      }
    />
  );
}
