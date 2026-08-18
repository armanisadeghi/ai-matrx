import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PressDeskGate } from "@/features/marketing/pr/reimagine/PressDeskGate";

export const metadata: Metadata = {
  title: "The Press Room",
  description:
    "One ranked desk for earned media: what is genuinely newsworthy about your businesses, the proof a newsroom will demand, the journalist windows closing today, and the coverage that landed.",
};

export default function PressRoomReimaginePage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 pr-14">
          <h1 className="truncate text-sm font-medium text-foreground">
            Press Room
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            — the newsroom desk
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <PressDeskGate />
      </div>
    </>
  );
}
