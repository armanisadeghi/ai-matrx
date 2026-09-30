"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";

export function MessagesThreadHeader() {
  return (
    <RouteHeader
      left={<span className="px-1.5 text-sm font-medium">Messages</span>}
      right={
        <IntelligenceIndicator feature="messaging" label="This conversation" />
      }
    />
  );
}
