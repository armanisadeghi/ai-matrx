// features/marketing/pr/PressRoomDoors.tsx
//
// The Press Room's doors to the two PR surfaces that live elsewhere, in the page header
// where a PR person looks first: the brand's PR calendar (the reserved Planning calendar
// route) and the media-list board (`/crm/outreach-lists`, org-wide CRM records). Before
// 2026-09-29 the calendar was reachable only through the PR Director's chat and the board
// only as "Campaigns & sequences" behind Outreach.

import Link from "next/link";
import { CalendarDays, ListChecks } from "lucide-react";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/** The media-list board (JournalistRef's MEDIA_LISTS_HREF lives in a client module, which a server component cannot read a value from). */
const MEDIA_LISTS_HREF = "/crm/outreach-lists";

export function PressRoomDoors({ brandId }: { brandId: string }) {
  const doors = [
    {
      href: `${marketingRoutes.brandSection(brandId, "planning")}/calendar`,
      label: "PR calendar",
      Icon: CalendarDays,
    },
    { href: MEDIA_LISTS_HREF, label: "Media lists", Icon: ListChecks },
  ];
  return (
    <nav aria-label="Press Room doors" className="ml-auto flex shrink-0 items-center gap-1">
      {doors.map(({ href, label, Icon }) => (
        <Link
          key={label}
          href={href}
          className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
