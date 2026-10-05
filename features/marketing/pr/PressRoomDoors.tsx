"use client";

// features/marketing/pr/PressRoomDoors.tsx
//
// The Press Room's header, with its doors to the two PR surfaces that live elsewhere, where a
// PR person looks first: the brand's PR calendar (the reserved Planning calendar route) and the
// media-list board (`/crm/outreach-lists`, org-wide CRM records). Before 2026-09-29 the calendar
// was reachable only through the PR Director's chat and the board only as "Campaigns &
// sequences" behind Outreach. The header is the canonical RecordPageHeader; the doors ride as
// its labeled actions. Guard: `__tests__/press-room-has-its-doors.test.ts`.

import { CalendarDays, ListChecks } from "lucide-react";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  RecordPageHeader,
  type RecordPageAction,
} from "@/features/shell/components/header/templates/RecordPageHeader";

const MEDIA_LISTS_HREF = "/crm/outreach-lists";

export function pressRoomDoors(brandSeg: string): RecordPageAction[] {
  return [
    {
      label: "PR calendar",
      icon: CalendarDays,
      href: `${marketingRoutes.brandSection(brandSeg, "planning")}/calendar`,
      showLabel: true,
    },
    { label: "Media lists", icon: ListChecks, href: MEDIA_LISTS_HREF, showLabel: true },
  ];
}

export function PressRoomHeader({ brandId }: { brandId: string }) {
  return <RecordPageHeader record={{ name: "Press Room" }} actions={pressRoomDoors(brandId)} />;
}
