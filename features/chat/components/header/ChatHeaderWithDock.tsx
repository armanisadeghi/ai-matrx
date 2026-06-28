"use client";

import React from "react";
import ClientHeaderContent from "@/features/chat/components/header/ClientHeaderContent";
import { BalancedMatrxFloatingMenu } from "@/components/layout/BalancedMatrxFloatingMenu";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatHeaderWithDockProps {
  title?: string;
  baseRoute?: string;
  growthFactor?: number;
  labelPosition?: "side" | "bottom";
}

const ChatHeaderWithDock: React.FC<ChatHeaderWithDockProps> = ({
  baseRoute = "/dashboard",
  title = "Matrx",
  growthFactor = 1.4,
  labelPosition = "bottom",
}) => {
  const isMobile = useIsMobile();

  // Only show the regular header on mobile devices
  if (isMobile) {
    return (
      <header className="py-2 px-3 flex items-center justify-between bg-zinc-100 dark:bg-zinc-850 z-11">
        <div className="flex items-center space-x-2">
          <Link href={baseRoute}>
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {title}
            </span>
          </Link>
        </div>

        {/* Client-side header right icons */}
        <ClientHeaderContent baseRoute={baseRoute} />
      </header>
    );
  }

  // On desktop, use completely independent floating elements at the edges with no connecting bar
  return (
    <>
      {/* Left side dock - completely independent positioning */}
      <div className="fixed top-2 left-2 z-50">
        <BalancedMatrxFloatingMenu
          growthFactor={growthFactor}
          labelPosition={labelPosition}
        />
      </div>

      {/* Right side controls - completely independent positioning */}
      <div className="fixed top-2 right-2 z-50 bg-transparent">
        <ClientHeaderContent baseRoute={baseRoute} />
      </div>

      {/* No spacer needed - content can go right to the top */}
    </>
  );
};

export default ChatHeaderWithDock;
