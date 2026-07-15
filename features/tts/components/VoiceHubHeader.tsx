"use client";

// VoiceHubHeader — the ONE shell header for the Voice module workspace
// (`/voice/playground` and `/voice/tester`). Center is the canonical
// sub-mode nav (RouteModeNav: Playground | Tester); callers pass their
// contextual action tap-buttons via `right`. No title text — the nav IS
// the identity.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { Volume2, FlaskConical } from "lucide-react";

const VOICE_NAV_ITEMS = [
  { name: "Playground", href: "/voice/playground", icon: Volume2 },
  { name: "Tester", href: "/voice/tester", icon: FlaskConical },
];

export function VoiceHubHeader({ right }: { right?: React.ReactNode }) {
  return (
    <RouteHeader
      center={<RouteModeNav items={VOICE_NAV_ITEMS} />}
      right={right}
    />
  );
}
